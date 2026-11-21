// 글 → 값: 초기 변수 · 패치 본문(YAML · JSON · JSON5 · 망가진 JSON)과 갱신 명령의 값 하나.
// MagVarUpdate(MIT, © 2025 MagicalAstrogy & StageDog)의 parseString · parseCommandValue 규칙을 따른다.
import YAML from 'yaml';
import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';
import { isObject } from './lo';
import * as math from 'mathjs';

/** 앞뒤 따옴표 · 역슬래시 · 공백 떼기 (여러 줄 글은 그대로: 원래 규칙이 그렇다) */
export function trimQuotesAndBackslashes(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/^[\\"'` ]*(.*?)[\\"'` ]*$/, '$1');
}

const errText = (e: unknown) => e instanceof Error ? (e.stack || e.message) : String(e);
/** YAML 을 먼저(JSON 처럼 생긴 글은 JSON5 먼저) · 그다음 JSON5 · 고친 JSON · YAML 순으로 읽는다. 다 안 되면 던진다 */
export function parseString(content: string): any {
  const jsonFirst = /^[[{]/s.test(content.trimStart());
  let yamlErr: unknown;
  if (!jsonFirst) { try { return YAML.parseDocument(content, { merge: true }).toJS(); } catch (e) { yamlErr = e; } }
  let json5Err: unknown, jsonErr: unknown;
  try { return JSON5.parse(content); } catch (e) { json5Err = e; }
  try { return JSON.parse(jsonrepair(content)); } catch (e) { jsonErr = e; }
  if (jsonFirst) { try { return YAML.parseDocument(content, { merge: true }).toJS(); } catch (e) { yamlErr = e; } }
  throw new Error(YAML.stringify({ 'Not valid YAML/JSON/JSON5': { content, yaml: errText(yamlErr), json5: errText(json5Err), json: errText(jsonErr) } }, { blockQuote: 'literal' }));
}

/** YAML 한 값 읽기 (실리태번의 YAML.parse 와 같다: 틀리면 던진다) */
export const yamlParse = (s: string): unknown => YAML.parse(s);
export const yamlStringify = (v: unknown): string => YAML.stringify(v, { blockQuote: 'literal' });
export const yamlStringifyQuoted = (v: unknown): string => YAML.stringify(v, { blockQuote: 'literal', defaultKeyType: 'PLAIN', defaultStringType: 'QUOTE_DOUBLE' });

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

/**
 * 依次尝试将命令值解析为 JSON、宽松数据字面量或数学表达式，失败后保留字符串。
 * 宽松对象使用 JSON5，单引号文本沿用 YAML；纯数学表达式复用受限实例，其他表达式单独隔离。
 */
export function parseCommandValue(valStr: unknown): any {
    if (typeof valStr !== 'string') return valStr;
    const trimmed = (valStr as string).trim();

    // 检查布尔值/null/undefined
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (trimmed === 'undefined') return undefined;

    try {
        // 如果字符串能被 JSON.parse 解析，说明它是一个标准格式，直接返回解析结果
        return JSON.parse(trimmed);
    } catch (e) {
        // Accept relaxed data literals without evaluating model-controlled JavaScript.
        if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
        ) {
            try {
                const result = JSON5.parse(trimmed);
                if (isObject(result) || Array.isArray(result)) {
                    return result;
                }
            } catch (err) {
                // 如果解析失败，说明它可能是一个未加引号的字符串或数学表达式，继续往下走
            }
        }
    }

    // 单引号文本提前走原有 YAML 路径，保留反斜杠和双单引号的语义，不初始化数学库。
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
        try {
            return YAML.parse(trimmed);
        } catch {
            // 仍可能是含字符串操作数的数学表达式，继续尝试求值。
        }
    }

    // 如果代码走到这里，说明 trimmed 是一个未加引号的字符串，例如：
    // 'hello_world', '10 + 2', 'sqrt(16)'

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
            return result.toString();
        }
        // 避免将单个单词的字符串（mathjs可能将其识别为符号）作为 undefined 返回
        if (result === undefined && !/^[a-zA-Z_]+$/.test(trimmed)) {
            return trimmed; // 如果是 undefined 但不是一个简单的符号名，则可能是解析错误
        }
        if (result !== undefined) {
            // 使用 toPrecision 来处理浮点数精度造成的误差问题
            return parseFloat(result.toPrecision(12));
        }
    } catch (err) {
        // 如果 math.evaluate 失败，说明它不是一个有效的表达式，
        // 那么它就是一个普通的未加引号的字符串。
    }

    // 实验性功能，暂不启用
    // 尝试将字符串解析为日期对象，用于传入_.add直接以毫秒数更新时间，如 `_.add('当前时间', 10 * 60 * 1000);`
    // 此检查用于识别日期字符串（例如 "2024-01-01T12:00:00Z"）
    // `isNaN(Number(trimmed))`确保纯数字字符串（如 "12345"）不会被错误地解析为日期
    /*
    if (isNaN(Number(trimmed))) {
        const potentialDate = new Date(trimQuotesAndBackslashes(trimmed));
        if (!isNaN(potentialDate.getTime())) {
            return potentialDate;
        }
    }
    */

    try {
        // 尝试 YAML.parse
        return YAML.parse(trimmed);
    } catch (e) {
        /* empty */
    }

    // 最终，返回这个去除了首尾引号的字符串
    return trimQuotesAndBackslashes(valStr as string);
}

