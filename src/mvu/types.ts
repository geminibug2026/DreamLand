// 변수 갱신 틀의 자료 꼴 · 이벤트 이름.
// MagVarUpdate (MIT License, Copyright (c) 2025 MagicalAstrogy & StageDog) 의 src/variable_def.ts 를 옮겨 왔다.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type TemplateType = StatData | StatData[] | any[];
export type StatDataMeta = { extensible?: boolean; recursiveExtensible?: boolean; required?: string[]; template?: TemplateType; [key: string]: unknown };
export type JSONPrimitive = string | number | boolean | null;
export type StatData = { [key: string]: any } & { $meta?: StatDataMeta; $arrayMeta?: boolean };

export type SchemaNode = ObjectSchemaNode | ArraySchemaNode | PrimitiveSchemaNode;
export type ObjectSchemaNode = { type: 'object'; properties: { [key: string]: SchemaNode & { required?: boolean } }; extensible?: boolean; template?: TemplateType; recursiveExtensible?: boolean };
export type ArraySchemaNode = { type: 'array'; elementType: SchemaNode; extensible?: boolean; template?: TemplateType; recursiveExtensible?: boolean };
export type PrimitiveSchemaNode = { type: 'string' | 'number' | 'boolean' | 'any' };
export type RootAdditionalProps = { strictTemplate?: boolean; concatTemplateArray?: boolean; strictSet?: boolean };

export const isArraySchema = (v: SchemaNode): v is ArraySchemaNode => v?.type === 'array';
export const isObjectSchema = (v: SchemaNode): v is ObjectSchemaNode => v?.type === 'object';
/** [값, "설명"] 꼴 */
export const isValueWithDescription = (v: unknown): v is [unknown, string] => Array.isArray(v) && v.length === 2 && typeof v[1] === 'string';

export type MvuData = {
  initialized_lorebooks: Record<string, any[]>;
  stat_data: StatData & { $meta?: StatDataMeta & RootAdditionalProps; $internal?: { display_data: Record<string, any>; delta_data: Record<string, any> } };
  schema: (ObjectSchemaNode & Partial<RootAdditionalProps>) | any;
  display_data?: Record<string, any>;
  delta_data?: Record<string, any>;
  [key: string]: any;
};
export const isMvuData = (v: unknown): v is MvuData => !!v && typeof v === 'object' && (v as Record<string, unknown>).stat_data !== undefined && (v as Record<string, unknown>).schema !== undefined;

export type CommandNames = 'set' | 'insert' | 'assign' | 'remove' | 'unset' | 'delete' | 'add' | 'move';
export interface Command { type: CommandNames; full_match: string; args: string[]; reason: string }
export interface UpdateContext { variables: MvuData; message_content: string }

export const variable_events = {
  VARIABLE_INITIALIZED: 'mag_variable_initialized',
  VARIABLE_UPDATE_STARTED: 'mag_variable_update_started',
  COMMAND_PARSED: 'mag_command_parsed',
  VARIABLE_UPDATE_ENDED: 'mag_variable_update_ended',
  BEFORE_MESSAGE_UPDATE: 'mag_before_message_update',
  /** @deprecated */
  SINGLE_VARIABLE_UPDATED: 'mag_variable_updated',
} as const;
export const exported_events = { INVOKE_MVU_PROCESS: 'mag_invoke_mvu', UPDATE_VARIABLE: 'mag_update_variable' } as const;
export const UPDATE_REGEX = /\[mvu_update\]/i;
export const PLOT_REGEX = /\[mvu_plot\]/i;
export const EXTENSIBLE_MARKER = '$__META_EXTENSIBLE__$';

/** 이벤트를 듣는 쪽(카드 스크립트 · 상태창 화면)에 알리고, 듣는 쪽이 인자를 고쳤으면 그대로 돌려받는다 */
export type Emit = (event: string, ...args: any[]) => Promise<void>;
