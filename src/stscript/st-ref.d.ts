// 빌드할 때 scripts/st-ref.mjs 가 명령 소스에서 뽑아 넣는 표: 명령 이름(또는 /정규식/) → 읽는 이름 붙은 값
declare module 'virtual:st-ref' {
  const ref: Record<string, { named: string[]; open?: true }>;
  export default ref;
}
