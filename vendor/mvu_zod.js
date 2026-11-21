// registerMvuSchema: zod 스키마를 쓰는 변수 갱신 카드의 도우미 (DreamLand 가 직접 쓴 것).
// 카드가 import 하는 tavern_resource 의 dist/util/mvu_zod.js 와 같은 일을 한다:
//   · 새 대화의 변수를 처음 채울 때 스키마로 고르고(기본값 · prefault),
//   · 갱신 명령마다 그 명령을 적용한 사본을 스키마에 대 보고(범위 맞추기 · 바꿔 넣기 transform), 통과한 것만 반영하고,
//   · 통과하지 못한 명령은 알리고 버리며, 앱의 기본 처리는 건너뛰게 한다.
// 쓰는 전역: z(zod) · _(lodash) · YAML · eventOn · toastr (모두 화면에 미리 깔린다)
const T = Object.assign({ path: 'path', input: 'input', cmdErr: 'Variable update error, you may need to reroll: {cmd}', initErr: 'Variable initialisation failed for greeting #{n}', notNumber: "✖ Cannot add to a value of type '{type}'", moveMissing: 'Source path of move does not exist: {path}', ok: 'Variable schema registered' }, (window.__dlInit && window.__dlInit.mvuText) || {});
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));
const copy = v => (v === undefined ? v : typeof structuredClone === 'function' ? structuredClone(v) : _.cloneDeep(v));
const dotPath = p => (window.z && z.core && typeof z.core.toDotPath === 'function' ? z.core.toDotPath(p) : (p || []).join('.'));

function issuesText(error) {
  return _.sortBy([...error.issues], i => (i.path ? i.path.length : 0)).flatMap(i => {
    const out = ['✖ ' + i.message];
    if (i.path && i.path.length) out.push('  → ' + T.path + ': ' + dotPath(i.path));
    if (i.input !== undefined) out.push('  → ' + T.input + ': ' + JSON.stringify(i.input));
    return out;
  }).join('\n');
}
function notify(level, content, title) {
  try { (level === 'warn' ? toastr.warning : toastr.error)(String(content), '[MVU zod] ' + title); } catch (e) { /* 알림이 없는 곳 */ }
  (level === 'warn' ? console.warn : console.error)(title + '\n' + content);
}
const unquote = s => String(s).replace(/^[\\"'` ]*(.*?)[\\"'` ]*$/, '$1');
// 잘못된 안내문 탓에 AI 가 'stat_data.' 를 붙여 쓰는 일이 있어 떼어 낸다
const pathOf = s => unquote(s).replace(/^(?:stat_data|status_current_variables)\./, '');
function valueOf(s) {
  if (typeof s !== 'string') return s;
  const v = rawValue(s);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(x => (x instanceof Date ? x.toISOString() : x));
  return v;
}
function rawValue(s) {
  const t = s.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (t === 'undefined') return undefined;
  try { return JSON.parse(t); } catch (e) {
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try { const r = new Function('return ' + t + ';')(); if (_.isObject(r)) return r; } catch (e2) { /* 글일 수 있다 */ }
    }
  }
  try { return YAML.parse(t); } catch (e) { /* 그냥 글 */ }
  return unquote(s);
}
// '_' 로 시작하는 칸은 읽기 전용 (AI 가 바꾸지 못한다)
const readOnly = p => (typeof p === 'string' ? _.toPath(p) : p).some(k => String(k).startsWith('_'));

export function registerMvuSchema(input) {
  const schemaOf = () => {
    const s = typeof input === 'function' ? input() : input;
    const out = s instanceof z.ZodObject ? z.looseObject(s.shape) : s;   // 스키마에 없는 칸도 지우지 않는다
    if (typeof registerVariableSchema === 'function') { try { registerVariableSchema(z.object({ stat_data: out }), { type: 'message' }); } catch (e) { /* 없어도 된다 */ } }
    return out;
  };
  schemaOf();

  eventOn('mag_variable_initialized', (variables, swipe) => {
    const schema = schemaOf();
    try {
      const r = schema.safeParse(_.get(variables, 'stat_data', {}), { reportInput: true });
      if (r.success) { variables.stat_data = { ...variables.stat_data, ...r.data }; return; }
      notify('error', z.prettifyError(r.error), fill(T.initErr, { n: swipe + 1 }));
    } catch (e) { notify('error', e && e.stack ? e.stack : String(e), fill(T.initErr, { n: swipe + 1 })); }
  });

  eventOn('mag_command_parsed_for_zod', (variables, commands, _content, onError) => {
    const schema = schemaOf(), notifyOn = !!(window.__dlInit && window.__dlInit.mvuNotify);
    const fail = (content, cmd) => { const title = fill(T.cmdErr, { cmd: cmd.full_match }); if (onError) onError(title + '\n' + content); else if (notifyOn) notify('warn', content, title); };
    const check = (data, cmd, report) => {
      let msg;
      try { const r = schema.safeParse(data, { reportInput: true }); if (r.success) return r.data; msg = issuesText(r.error); }
      catch (e) { msg = e && e.stack ? e.stack : String(e); }
      if (report) fail(msg, cmd);
      return null;
    };
    const apply = (data, cmd) => {
      if (cmd.type === 'set') {
        if (cmd.args.length === 3) cmd.args.splice(1, 1);
        const p = pathOf(cmd.args[0]); if (readOnly(p)) return null;
        if (p) _.set(data, p, valueOf(cmd.args[1])); else data = valueOf(cmd.args[1]);
        return check(data, cmd, true);
      }
      if (cmd.type === 'add') {
        const p = pathOf(cmd.args[0]); if (!p || readOnly(p)) return null;
        const old = _.get(data, p);
        if (typeof old !== 'number') { fail([fill(T.notNumber, { type: typeof old }), '  → ' + T.path + ': ' + p, '  → ' + T.input + ': ' + JSON.stringify(old)].join('\n'), cmd); return null; }
        const d = valueOf(cmd.args[1]);
        _.update(data, p, v => v + Number(d));
        return check(data, cmd, true);
      }
      if (cmd.type === 'insert') {
        const p = pathOf(cmd.args[0]); if (readOnly(p)) return null;
        const key = valueOf(cmd.args[1]), val = valueOf(cmd.args[cmd.args.length - 1]);
        const put = (d, report) => {
          const col = p === '' ? d : _.get(d, p);
          if (cmd.args.length === 2) { if (Array.isArray(col)) col.push(val); else _.assign(col, val); }
          else if (Array.isArray(col)) col.splice(key === '-' ? col.length : key, 0, val);
          else col[String(key)] = val;
          return check(d, cmd, report);
        };
        const col = p === '' ? data : _.get(data, p);
        if (!_.isNil(col) && !Array.isArray(col) && !_.isPlainObject(col)) return null;
        if (!_.isNil(col)) return put(data, true);
        // 없는 칸: 먼저 객체로, 안 되면 배열로 만들어 본다 (마지막 시도만 알린다)
        const asObj = put(_.set(copy(data), p, {}), false); if (asObj) return asObj;
        return put(_.set(copy(data), p, []), true);
      }
      if (cmd.type === 'delete') {
        const p = cmd.args.map(pathOf).join('.'), parts = _.toPath(p); if (readOnly(parts)) return null;
        const parent = _.get(data, _.dropRight(parts));
        if (Array.isArray(parent)) _.pullAt(parent, Number(_.last(parts))); else _.unset(data, parts);
        return check(data, cmd, true);
      }
      return null;
    };
    const used = [];
    commands.forEach((cmd, i) => {
      let data = copy(variables.stat_data);
      if (cmd.type === 'move') {
        const from = pathOf(cmd.args[0]);
        if (!_.has(data, from)) { fail(fill(T.moveMissing, { path: from }), cmd); return; }
        const v = _.get(data, from), to = pathOf(cmd.args[1]);
        data = apply(data, { ...cmd, type: 'delete', args: [from] });
        data = apply(data, { ...cmd, type: 'set', args: [to, v] });
      } else data = apply(data, cmd);
      // 맨 위 칸을 지운 경우 키 수만 견주면 바뀐 것을 놓치므로 지운 경로를 따로 본다
      const gone = cmd.type === 'delete' ? [_.toPath(cmd.args.map(pathOf).join('.'))] : cmd.type === 'move' ? [_.toPath(pathOf(cmd.args[0]))] : [];
      const removed = data !== null && gone.some(p => _.has(variables.stat_data, p) && !_.has(data, p));
      if (data !== null && (removed || !_.isEqual(data, _.pick(variables.stat_data, Object.keys(data))))) {
        gone.forEach(p => { if (!_.has(data, p)) _.unset(variables.stat_data, p); });
        variables.stat_data = { ...variables.stat_data, ...data };
        used.push(i);
      }
    });
    _.pullAt(commands, used);
  });
  // 스키마가 맡았으니 앱의 기본 처리는 남은 명령을 하지 않는다
  eventOn('mag_command_parsed_ended_for_zod', (_v, commands) => { commands.length = 0; });
  eventOn('mag_variable_update_ended_for_zod', variables => { _.set(variables, 'schema', '没有用别管这个'); _.unset(variables, 'display_data'); _.unset(variables, 'delta_data'); });
  console.info(T.ok);
}
export default registerMvuSchema;
