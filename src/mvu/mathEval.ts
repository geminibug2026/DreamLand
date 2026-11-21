// 갱신 명령 값의 셈 (mathjs). 무거워서(약 0.9MB) 셈이 실제로 필요한 답을 받았을 때만 불러온다 — parse.ts 의 loadMath
// MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 parseCommandValue 셈 규칙을 그대로 옮겼다.
import * as math from 'mathjs';

// ── 셈 (mathjs): MagVarUpdate 의 규칙 그대로 — 고칠 수 없는 Math · math 묶음만 보여 주고, 단순한 셈은 한 계산기를 다시 쓴다 ──
/**
 * 只复制允许的数学函数和常量，并冻结为独立命名空间。
 * 保留 Math.floor、math.pow 等表达式写法，避免模型表达式修改宿主或共享库。
 */
function createReadOnlyMathNamespace(
    source: Record<string, unknown>,
    names: readonly string[]
): Readonly<Record<string, unknown>> {
    // mathjs deliberately rejects property access on null-prototype objects. A frozen ordinary
    // object is still isolated from the host namespace and keeps `Math.floor`/`math.pow` syntax.
    const namespace: Record<string, unknown> = {};
    for (const name of names) {
        const value = source[name];
        namespace[name] = typeof value === 'function' ? value.bind(source) : value;
    }
    return Object.freeze(namespace);
}

// Never expose mutable host/library namespaces to model-controlled math expressions. mathjs
// supports assignment nodes, so passing the real Math object here would let an expression such
// as `Math.random = 0` corrupt global state. These facades preserve the documented prefixed
// spelling while exposing only pure numeric helpers and immutable constants.
const SAFE_JAVASCRIPT_MATH = createReadOnlyMathNamespace(
    Math as unknown as Record<string, unknown>,
    Object.getOwnPropertyNames(Math)
);
const SAFE_MATHJS_NAMESPACE = createReadOnlyMathNamespace(
    math as unknown as Record<string, unknown>,
    [
        'abs',
        'acos',
        'acosh',
        'asin',
        'asinh',
        'atan',
        'atan2',
        'atanh',
        'ceil',
        'cos',
        'cosh',
        'cube',
        'e',
        'exp',
        'expm1',
        'floor',
        'gcd',
        'hypot',
        'lcm',
        'log',
        'log10',
        'log1p',
        'log2',
        'max',
        'mean',
        'median',
        'min',
        'mod',
        'nthRoot',
        'pi',
        'pow',
        'prod',
        'round',
        'sign',
        'sin',
        'sinh',
        'sqrt',
        'square',
        'std',
        'sum',
        'tan',
        'tanh',
        'tau',
        'variance',
    ]
);

const REUSABLE_MATH_FUNCTIONS = new Set([
    ...Object.keys(SAFE_MATHJS_NAMESPACE).filter(
        name => typeof SAFE_MATHJS_NAMESPACE[name] === 'function'
    ),
    'complex',
    'det',
    'matrix',
    'number',
    'unit',
]);
let reusable_math: math.MathJsInstance | undefined;

/** 复用实例只允许访问现有只读 Math/math 门面，不接触函数对象或其他可变对象的成员。 */
function isReadOnlyMathAccessor(node: math.AccessorNode): boolean {
    const property = node.index.dimensions[0];
    if (
        !math.isSymbolNode(node.object) ||
        node.index.dimensions.length !== 1 ||
        !math.isConstantNode(property) ||
        typeof property.value !== 'string'
    ) {
        return false;
    }
    const namespace =
        node.object.name === 'Math'
            ? SAFE_JAVASCRIPT_MATH
            : node.object.name === 'math'
              ? SAFE_MATHJS_NAMESPACE
              : undefined;
    return namespace !== undefined && Object.hasOwn(namespace, property.value);
}

/**
 * 只让无赋值、无间接调用的纯数学表达式复用实例；检查整棵语法树，不能用字符串匹配替代。
 * 求导后 evaluate、动态函数、配置/单位修改等仍走一次性实例，保留兼容性并隔离状态。
 */
function canReuseMathInstance(expression: math.MathNode): boolean {
    return (
        expression.filter(node => {
            if (math.isAssignmentNode(node) || math.isFunctionAssignmentNode(node)) {
                return true;
            }
            if (math.isAccessorNode(node)) {
                return !isReadOnlyMathAccessor(node);
            }
            if (math.isFunctionNode(node)) {
                return math.isSymbolNode(node.fn)
                    ? !REUSABLE_MATH_FUNCTIONS.has(node.fn.name)
                    : !math.isAccessorNode(node.fn) || !isReadOnlyMathAccessor(node.fn);
            }
            return false;
        }).length === 0
    );
}


/** 셈해 보고, 셈이 된 경우만 { v } 로 돌려준다 (안 되면 undefined — 부른 쪽이 YAML · 글로 넘어간다) */
export function evalMath(trimmed: string): { v: any } | undefined {
    try {
        const evaluator = (reusable_math ??= math.create(math.all));
        const expression = evaluator.parse(trimmed);
        // 创建一个 scope 对象，将多种数学库/对象注入到 mathjs 的执行环境中，
        // 以便统一处理不同风格的数学表达式。
        const scope = {
            // 支持 JavaScript 标准的 Math 对象 (e.g., Math.sqrt(), Math.PI)
            Math: SAFE_JAVASCRIPT_MATH,
            // 支持 Python 风格的 math 库用法 (e.g., math.sqrt(), math.pi)，
            // 这在 LLM 生成的代码中很常见。
            math: SAFE_MATHJS_NAMESPACE,
        };
        // 尝试使用 mathjs 进行数学求值
        // math.evaluate 对于无法识别为表达式的纯字符串会抛出错误
        const result = canReuseMathInstance(expression)
            ? expression.compile().evaluate(scope)
            : math.create(math.all).evaluate(trimmed, scope);
        // 如果结果是 mathjs 的复数或矩阵对象，则将其转换为字符串表示形式
        if (math.isComplex(result) || math.isMatrix(result)) {
            return { v: result.toString() };
        }
        // 避免将单个单词的字符串（mathjs可能将其识别为符号）作为 undefined 返回
        if (result === undefined && !/^[a-zA-Z_]+$/.test(trimmed)) {
            return { v: trimmed }; // 如果是 undefined 但不是一个简单的符号名，则可能是解析错误
        }
        if (result !== undefined) {
            // 使用 toPrecision 来处理浮点数精度造成的误差问题
            return { v: parseFloat(result.toPrecision(12)) };
        }
    } catch (err) {
        // 如果 math.evaluate 失败，说明它不是一个有效的表达式，
        // 那么它就是一个普通的未加引号的字符串。
    }
    return undefined;
}
