import{n as e}from"./rolldown-runtime-XKyaHtl9.js";import{o as t,v as n}from"./core-DnU7zaxr.js";import{u as r}from"./i18n-DODYOv2X.js";var i=e({X:()=>a,dropOwner:()=>o,runFilters:()=>s}),a={commands:new Map,macros:new Map,panels:[],actions:[],pages:[],filters:[],themes:[],composer:[],prompt:[],studio:[],before:[],received:[],loreFilter:null,varsOf:null,macroLike:[],loreVec:null,translate:null,covered:null,gate:null};function o(e){for(let[t,n]of a.commands)n.owner===e&&a.commands.delete(t);for(let[t,n]of a.macros)n.owner===e&&a.macros.delete(t);let t=a;for(let n of[`panels`,`actions`,`pages`,`filters`,`themes`,`composer`,`prompt`,`before`,`received`])t[n]=t[n].filter(t=>t.owner!==e)}function s(e,t){for(let n of a.filters)try{let r=n.fn(e,t);typeof r==`string`&&(e=r)}catch(e){console.warn(`[확장 필터]`,n.owner,e)}return e}var c=e({AF:()=>S,AF_ROLES:()=>g,BUILTIN:()=>d,KINDS:()=>f,TEXT_PROVIDER_KINDS:()=>B,cleanCompletion:()=>Q,fmtChat:()=>G,fmtExamples:()=>Y,fmtLast:()=>K,fmtStory:()=>W,importPowerUser:()=>I,instructName:()=>z,instructStops:()=>X,masterExport:()=>L,parseExamples:()=>q,renderStory:()=>U,renderTemplate:()=>H,resolve:()=>V,tplApply:()=>A,tplCurrent:()=>w,tplDelete:()=>k,tplDirty:()=>j,tplGet:()=>E,tplImport:()=>F,tplIsBuiltin:()=>D,tplKind:()=>P,tplList:()=>T,tplSave:()=>O,trimToEndSentence:()=>Z}),l=t,u=()=>n().format,d={context:[{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!1,trim_sentences:!1,single_line:!0,name:`Adventure`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!1,trim_sentences:!1,single_line:!1,name:`Alpaca-Single-Turn`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Alpaca`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`ChatML-Names`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`ChatML`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Command R`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`DeepSeek-V2.5`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:`***`,chat_start:`***`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Default`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Dots1`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Gemma 2`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Gemma 4`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`GLM-4`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:`### Example:`,chat_start:`### START ROLEPLAY:`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Libra-32B`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:`Example of an interaction:
`,chat_start:`This is the history of the roleplay:
`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Lightning 1.1`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Llama 2 Chat`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Llama 3 Instruct`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Llama 4 Instruct`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Llama-3-Instruct-Names`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Metharme`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Minimalist`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Mistral V1`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Mistral V2 & V3`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Mistral V3-Tekken`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Mistral V7-Tekken`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Mistral V7`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Moonshot AI`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:`***`,chat_start:`***`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`NovelAI`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{char}}'s personality: {{personality}}
{{/if}}{{#if scenario}}Circumstances and context of the dialogue: {{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}`,example_separator:`This is how {{char}} should talk`,chat_start:`
Then the roleplay chat between {{user}} and {{char}} begins.
`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`OldDefault`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`OpenAI Harmony`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Phi`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{char}}'s personality: {{personality}}
{{/if}}{{#if scenario}}Scenario: {{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}`,example_separator:`### New Roleplay:`,chat_start:`### New Roleplay:`,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`simple-proxy-for-tavern`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Story`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Synthia`},{story_string:`{{#if anchorBefore}}{{anchorBefore}}
{{/if}}{{#if system}}{{system}}
{{/if}}{{#if wiBefore}}{{wiBefore}}
{{/if}}{{#if description}}{{description}}
{{/if}}{{#if personality}}{{personality}}
{{/if}}{{#if scenario}}{{scenario}}
{{/if}}{{#if wiAfter}}{{wiAfter}}
{{/if}}{{#if persona}}{{persona}}
{{/if}}{{#if anchorAfter}}{{anchorAfter}}
{{/if}}{{trim}}`,example_separator:``,chat_start:``,use_stop_strings:!1,names_as_stop_strings:!0,story_string_position:0,story_string_depth:1,story_string_role:0,always_force_name2:!0,trim_sentences:!1,single_line:!1,name:`Tulu`}],instruct:[{input_sequence:``,output_sequence:``,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`none`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`Adventure`},{input_sequence:``,output_sequence:``,last_output_sequence:`
### Response:`,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:`<START OF CHAT>`,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:`,story_string_suffix:`
`,name:`Alpaca-Single-Turn`},{input_sequence:`### Instruction:`,output_sequence:`### Response:`,last_output_sequence:``,system_sequence:`### Input:`,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`

`,input_suffix:`

`,system_suffix:`

`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:`

`,name:`Alpaca`},{input_sequence:`<|im_start|>{{name}}`,output_sequence:`<|im_start|>{{name}}`,last_output_sequence:``,system_sequence:`<|im_start|>system`,stop_sequence:`<|im_end|>`,wrap:!0,macro:!0,names_behavior:`none`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|im_end|>
`,input_suffix:`<|im_end|>
`,system_suffix:`<|im_end|>
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|im_start|>system`,story_string_suffix:`<|im_end|>
`,name:`ChatML-Names`},{input_sequence:`<|im_start|>user`,output_sequence:`<|im_start|>assistant`,last_output_sequence:``,system_sequence:`<|im_start|>system`,stop_sequence:`<|im_end|>`,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|im_end|>
`,input_suffix:`<|im_end|>
`,system_suffix:`<|im_end|>
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|im_start|>system`,story_string_suffix:`<|im_end|>
`,name:`ChatML`},{input_sequence:`<|START_OF_TURN_TOKEN|><|USER_TOKEN|>`,output_sequence:`<|START_OF_TURN_TOKEN|><|CHATBOT_TOKEN|>`,last_output_sequence:``,system_sequence:`<|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>`,stop_sequence:`<|END_OF_TURN_TOKEN|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|END_OF_TURN_TOKEN|>`,input_suffix:`<|END_OF_TURN_TOKEN|>`,system_suffix:`<|END_OF_TURN_TOKEN|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>`,story_string_suffix:`<|END_OF_TURN_TOKEN|>`,name:`Command R`},{input_sequence:`<｜User｜>`,output_sequence:`<｜Assistant｜>`,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<｜end▁of▁sentence｜>`,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`DeepSeek-V2.5`},{input_sequence:`<|userprompt|>`,output_sequence:`<|response|>`,last_output_sequence:``,system_sequence:`<|system|>`,stop_sequence:`<|endofresponse|>`,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|endofresponse|>
`,input_suffix:`<|endofuserprompt|>
`,system_suffix:`<|endofsystem|>
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|system|>`,story_string_suffix:`<|endofsystem|>
`,name:`Dots1`},{input_sequence:`<start_of_turn>user`,output_sequence:`<start_of_turn>model`,last_output_sequence:``,system_sequence:`<start_of_turn>system`,stop_sequence:`<end_of_turn>`,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<end_of_turn>
`,input_suffix:`<end_of_turn>
`,system_suffix:`<end_of_turn>
`,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<start_of_turn>user`,story_string_suffix:`<end_of_turn>
`,name:`Gemma 2`},{input_sequence:`<|turn>user
`,output_sequence:`<|turn>model
`,last_output_sequence:``,system_sequence:`<|turn>system
`,stop_sequence:`<turn|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<turn|>
`,input_suffix:`<turn|>
`,system_suffix:`<turn|>
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|turn>system
`,story_string_suffix:`<turn|>
`,name:`Gemma 4`},{input_sequence:`<|user|>
`,output_sequence:`<|assistant|>
`,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[gMASK]<sop>`,story_string_suffix:`
`,name:`GLM-4`},{input_sequence:`USER: `,output_sequence:`GPT: `,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:` `,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`BEGINNING OF CONVERSATION: `,story_string_suffix:`
`,name:`Koala`},{input_sequence:`{{[INPUT]}}`,output_sequence:`{{[OUTPUT]}}`,last_output_sequence:``,system_sequence:`{{[SYSTEM]}}`,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`{{[OUTPUT_END]}}`,input_suffix:`{{[INPUT_END]}}`,system_suffix:`{{[SYSTEM_END]}}`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`{{[SYSTEM]}}`,story_string_suffix:`{{[SYSTEM_END]}}`,name:`KoboldAI`},{input_sequence:``,output_sequence:``,last_output_sequence:`
### Response:`,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`always`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`### Instruction:`,story_string_suffix:``,name:`Libra-32B`},{input_sequence:`### Instruction:`,output_sequence:`### Response:`,last_output_sequence:`### Response: (length = unlimited)`,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`

`,input_suffix:`

`,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`Below is an instruction that describes a task. Write a response that appropriately completes the request.

### Instruction:`,story_string_suffix:`

`,name:`Lightning 1.1`},{input_sequence:`[INST] `,output_sequence:``,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`
`,input_suffix:` [/INST]
`,system_suffix:``,user_alignment_message:`Let's get started. Please respond based on the information and instructions provided above.`,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[INST] <<SYS>>
`,story_string_suffix:`
<</SYS>> Understood. [/INST]`,name:`Llama 2 Chat`},{input_sequence:`<|start_header_id|>user<|end_header_id|>

`,output_sequence:`<|start_header_id|>assistant<|end_header_id|>

`,last_output_sequence:``,system_sequence:`<|start_header_id|>system<|end_header_id|>

`,stop_sequence:`<|eot_id|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|eot_id|>`,input_suffix:`<|eot_id|>`,system_suffix:`<|eot_id|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|start_header_id|>system<|end_header_id|>

`,story_string_suffix:`<|eot_id|>`,name:`Llama 3 Instruct`},{input_sequence:`<|header_start|>user<|header_end|>

`,output_sequence:`<|header_start|>assistant<|header_end|>

`,last_output_sequence:``,system_sequence:`<|header_start|>system<|header_end|>

`,stop_sequence:`<|eot|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|eot|>`,input_suffix:`<|eot|>`,system_suffix:`<|eot|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|begin_of_text|><|header_start|>system<|header_end|>

`,story_string_suffix:`<|eot|>`,name:`Llama 4 Instruct`},{input_sequence:`<|start_header_id|>{{name}}<|end_header_id|>

`,output_sequence:`<|start_header_id|>{{name}}<|end_header_id|>

`,last_output_sequence:``,system_sequence:`<|start_header_id|>system<|end_header_id|>

`,stop_sequence:`<|eot_id|>`,wrap:!1,macro:!0,names_behavior:`none`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|eot_id|>`,input_suffix:`<|eot_id|>`,system_suffix:`<|eot_id|>`,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|start_header_id|>system<|end_header_id|>

`,story_string_suffix:`<|eot_id|>`,name:`Llama-3-Instruct-Names`},{input_sequence:`<|user|>`,output_sequence:`<|model|>`,last_output_sequence:``,system_sequence:``,stop_sequence:`</s>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|system|>`,story_string_suffix:``,name:`Metharme`},{input_sequence:` [INST] `,output_sequence:` [/INST] `,last_output_sequence:` [/INST]`,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:``,system_suffix:``,user_alignment_message:`Let's get started. Please respond based on the information and instructions provided above.`,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:` [INST] `,story_string_suffix:` [/INST] Understood.</s>`,name:`Mistral V1`},{input_sequence:`[INST] `,output_sequence:`[/INST] `,last_output_sequence:`[/INST]`,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:``,system_suffix:``,user_alignment_message:`Let's get started. Please respond based on the information and instructions provided above.`,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[INST] `,story_string_suffix:`[/INST] Understood.</s>`,name:`Mistral V2 & V3`},{input_sequence:`[INST]`,output_sequence:`[/INST]`,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:``,system_suffix:``,user_alignment_message:`Let's get started. Please respond based on the information and instructions provided above.`,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[INST]`,story_string_suffix:`[/INST]Understood.</s>`,name:`Mistral V3-Tekken`},{input_sequence:`[INST]`,output_sequence:``,last_output_sequence:``,system_sequence:`[SYSTEM_PROMPT]`,stop_sequence:`</s>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:`[/INST]`,system_suffix:`[/SYSTEM_PROMPT]`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[SYSTEM_PROMPT]`,story_string_suffix:`[/SYSTEM_PROMPT]`,name:`Mistral V7-Tekken`},{input_sequence:`[INST] `,output_sequence:` `,last_output_sequence:``,system_sequence:`[SYSTEM_PROMPT] `,stop_sequence:`</s>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:`[/INST]`,system_suffix:`[/SYSTEM_PROMPT]`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`[SYSTEM_PROMPT] `,story_string_suffix:`[/SYSTEM_PROMPT]`,name:`Mistral V7`},{input_sequence:`<|im_user|>user<|im_middle|>`,output_sequence:`<|im_assistant|>assistant<|im_middle|>`,last_output_sequence:``,system_sequence:`<|im_system|>system<|im_middle|>`,stop_sequence:`<|im_end|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|im_end|>`,input_suffix:`<|im_end|>`,system_suffix:`<|im_end|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|im_system|>system<|im_middle|>`,story_string_suffix:`<|im_end|>`,name:`Moonshot AI`},{input_sequence:`<|start|>user<|message|>`,output_sequence:`<|start|>assistant<|channel|>final<|message|>`,last_output_sequence:`{{noop}}`,system_sequence:`<|start|>developer<|message|>`,stop_sequence:``,wrap:!1,macro:!0,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|end|>`,input_suffix:`<|end|>`,system_suffix:`<|end|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,names_behavior:`force`,sequences_as_stop_strings:!1,story_string_prefix:`<|start|>system<|message|>`,story_string_suffix:`<|end|>`,name:`OpenAI Harmony (Thinking)`},{input_sequence:`<|start|>user<|message|>`,output_sequence:`<|start|>assistant<|channel|>final<|message|>`,last_output_sequence:``,system_sequence:`<|start|>developer<|message|>`,stop_sequence:``,wrap:!1,macro:!0,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|end|>`,input_suffix:`<|end|>`,system_suffix:`<|end|>`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,names_behavior:`force`,sequences_as_stop_strings:!0,story_string_prefix:`<|start|>system<|message|>`,story_string_suffix:`<|end|>`,name:`OpenAI Harmony`},{input_sequence:`
User: `,output_sequence:`
Assistant: `,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|end_of_turn|>`,input_suffix:`<|end_of_turn|>`,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`OpenOrca-OpenChat`},{input_sequence:`<|user|>
`,output_sequence:`<|assistant|>
`,last_output_sequence:``,system_sequence:`<|system|>
`,stop_sequence:`<|end|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|end|>
`,input_suffix:`<|end|>
`,system_suffix:`<|end|>
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|system|>
`,story_string_suffix:`<|end|>
`,name:`Phi`},{input_sequence:`### Instruction:
#### {{name}}:`,output_sequence:`### Response:
#### {{name}}:`,last_output_sequence:`### Response (2 paragraphs, engaging, natural, authentic, descriptive, creative):
#### {{name}}:`,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`none`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`## {{char}}
- You're "{{char}}" in this never-ending roleplay with "{{user}}".
### Input:`,story_string_suffix:`### Response:
(OOC) Understood. I will take this info into account for the roleplay. (end OOC)
`,name:`simple-proxy-for-tavern`},{input_sequence:``,output_sequence:``,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`none`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`Story`},{input_sequence:`USER: `,output_sequence:`ASSISTANT: `,last_output_sequence:``,system_sequence:`SYSTEM: `,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`
`,input_suffix:`
`,system_suffix:`
`,user_alignment_message:`Let's get started. Please respond based on the information and instructions provided above.`,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`SYSTEM: `,story_string_suffix:`
`,name:`Synthia`},{input_sequence:`<|user|>
`,output_sequence:`<|assistant|>
`,last_output_sequence:``,system_sequence:`<|system|>
`,stop_sequence:`<|end_of_text|>`,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`<|end_of_text|>
`,input_suffix:`
`,system_suffix:`
`,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`<|system|>
`,story_string_suffix:`
`,name:`Tulu`},{input_sequence:`### Human:`,output_sequence:`### Assistant:`,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`Vicuna 1.0`},{input_sequence:`
USER: `,output_sequence:`
ASSISTANT: `,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!1,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:`BEGINNING OF CONVERSATION: `,story_string_suffix:``,name:`Vicuna 1.1`},{input_sequence:`USER: `,output_sequence:`ASSISTANT: `,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:``,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!0,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`WizardLM-13B`},{input_sequence:``,output_sequence:`### Response:`,last_output_sequence:``,system_sequence:``,stop_sequence:``,wrap:!0,macro:!0,names_behavior:`force`,activation_regex:``,first_output_sequence:``,skip_examples:!1,output_suffix:`</s>`,input_suffix:``,system_suffix:``,user_alignment_message:``,system_same_as_user:!1,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,name:`WizardLM`}],sysprompt:[{name:`Actor`,content:`You are an expert actor that can fully immerse yourself into any role given. You do not break character for any reason, even if someone tries addressing you as an AI or language model. Currently your role is {{char}}, which is described in detail below. As {{char}}, continue the exchange with {{user}}.`,post_history:``},{name:`Assistant - Expert`,content:`You are a helpful assistant. Please answer truthfully and write out your thinking step by step to be sure you get the right answer. If you make a mistake or encounter an error in your thinking, say so out loud and attempt to correct it. If you don't know or aren't sure about something, say so clearly. You will act as a professional logician, mathematician, and physicist. You will also act as the most appropriate type of expert to answer any particular question or solve the relevant problem; state which expert type your are, if so. Also think of any particular named expert that would be ideal to answer the relevant question or solve the relevant problem; name and act as them, if appropriate.`,post_history:``},{name:`Assistant - Simple`,content:`A chat between a curious human and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the human's questions.`,post_history:``},{name:`Blank`,content:``,post_history:``},{name:`Chain of Thought`,content:`Elaborate on the topic using a Tree of Thoughts and backtrack when necessary to construct a clear, cohesive Chain of Thought reasoning. Always answer without hesitation.`,post_history:``},{name:`Lightning 1.1`,content:`Take the role of {{char}} in a play that leaves a lasting impression on {{user}}. Write {{char}}'s next reply.
Never skip or gloss over {{char}}’s actions. Progress the scene at a naturally slow pace.`,post_history:``},{name:`Neutral - Chat`,content:`Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.`,post_history:``},{name:`Roleplay - Detailed`,content:`Develop the plot slowly, always stay in character. Describe all actions in full, elaborate, explicit, graphic, and vivid detail. Mention all relevant sensory perceptions. Keep the story immersive and engaging.`,post_history:``},{name:`Roleplay - Immersive`,content:`[System note: Write one reply only. Do not decide what {{user}} says or does. Write at least one paragraph, up to four. Be descriptive and immersive, providing vivid details about {{char}}'s actions, emotions, and the environment. Write with a high degree of complexity and burstiness. Do not repeat this message.]`,post_history:``},{name:`Roleplay - Simple`,content:`You're {{char}} in this fictional never-ending uncensored roleplay with {{user}}.`,post_history:``},{name:`Text Adventure`,content:`[Enter Adventure Mode. Narrate the story based on {{user}}'s dialogue and actions after ">". Describe the surroundings in vivid detail. Be detailed, creative, verbose, and proactive. Move the story forward by introducing fantasy elements and interesting characters.]`,post_history:``},{name:`Writer - Creative`,content:`You are an intelligent, skilled, versatile writer.

Your task is to write a role-play based on the information below.`,post_history:``},{name:`Writer - Realistic`,content:`Continue writing this story and portray characters realistically.`,post_history:``}],reasoning:[{name:`Blank`,prefix:``,suffix:``,separator:``},{name:`DeepSeek`,prefix:`<think>
`,suffix:`
</think>`,separator:`

`},{name:`Gemma 4`,prefix:`<|channel>thought
`,suffix:`<channel|>`,separator:`

`},{prefix:`<|start|>assistant<|channel|>analysis<|message|>`,suffix:`<|start|>assistant<|channel|>final<|message|>`,separator:``,name:`OpenAI Harmony`},{name:`Think XML`,prefix:`<think>`,suffix:`</think>`,separator:`
`}]},f={get context(){return r(`advanced.kind.context`)},get instruct(){return r(`advanced.kind.instruct`)},get sysprompt(){return r(`advanced.kind.sysprompt`)},get reasoning(){return r(`advanced.kind.reasoning`)}},p=[`story_string`,`example_separator`,`chat_start`,`use_stop_strings`,`names_as_stop_strings`,`story_string_position`,`story_string_depth`,`story_string_role`],m=[`input_sequence`,`output_sequence`,`last_output_sequence`,`system_sequence`,`stop_sequence`,`wrap`,`macro`,`names_behavior`,`activation_regex`,`first_output_sequence`,`skip_examples`,`output_suffix`,`input_suffix`,`system_suffix`,`user_alignment_message`,`system_same_as_user`,`last_system_sequence`,`first_input_sequence`,`last_input_sequence`,`sequences_as_stop_strings`,`story_string_prefix`,`story_string_suffix`],h={chatml:`ChatML`,llama3:`Llama 3 Instruct`,mistral:`Mistral V2 & V3`,alpaca:`Alpaca`,gemma:`Gemma 2`,phi:`Phi`,vicuna:`Vicuna 1.1`,commandr:`Command R`,metharme:`Metharme`},g=[`system`,`user`,`assistant`],_=e=>String(e??``).replace(/\\n/g,`
`),v=e=>[...new Set(e)],y=e=>String(e).replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),b=()=>{let e=l.settings.templates||={};for(let t in f)Array.isArray(e[t])||(e[t]=[]);return e},x=(e,t)=>e[t];function S(){let e=l.settings.format||={};if(e.v===2)return e;let t=u(),n=e.context||{},r=e.instruct||{},i=e.reasoning||{};if(`exampleSep`in n||`chatStart`in n||`namesAsStop`in n||`addCharName`in n?(e.ccExampleSep=_(n.exampleSep),e.ccChatStart=_(n.chatStart),e.alwaysForceName2=!!n.addCharName,e.context={...t.context,names_as_stop_strings:n.namesAsStop!==!1}):e.context={...t.context,...n},`systemSeq`in r||`inputSeq`in r||`seqAsStop`in r){let n={...t.instruct,name:`이전 직접 정의`,enabled:!1,wrap:!1,macro:!0,system_sequence:_(r.systemSeq),system_suffix:_(r.systemSuffix),input_sequence:_(r.inputSeq),input_suffix:_(r.inputSuffix),output_sequence:_(r.outputSeq),output_suffix:_(r.outputSuffix),first_output_sequence:_(r.firstOutputSeq),last_output_sequence:_(r.lastOutputSeq),stop_sequence:_(r.stopSeq),user_alignment_message:_(r.userAlign),sequences_as_stop_strings:r.seqAsStop!==!1,system_same_as_user:!!r.systemAsUser,names_behavior:{none:`none`,group:`force`,always:`always`}[r.names]||`none`,story_string_prefix:_(r.systemSeq),story_string_suffix:_(r.systemSuffix),last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,activation_regex:``,skip_examples:!1};r.inputSeq||r.outputSeq||r.systemSeq?(e.instruct=n,b().instruct.push(C(`instruct`,n))):e.instruct={...t.instruct}}else e.instruct={...t.instruct,...r};e.reasoning={...t.reasoning,...i,prefix:_(i.prefix??t.reasoning.prefix),suffix:_(i.suffix??t.reasoning.suffix),separator:_(i.separator??t.reasoning.separator)},e.sysprompt={...t.sysprompt,...e.sysprompt||{}},delete e.showPrefill;for(let n in t)e[n]===void 0&&(e[n]=t[n]);return e.v=2,l.saveSettings?.(),e}function C(e,t){let n=l.settings.format||{},r={};if(e===`context`){for(let e of p)r[e]=/position|depth|role/.test(e)?Number(t[e])||0:t[e];r.always_force_name2=t.always_force_name2??!!n.alwaysForceName2,r.trim_sentences=t.trim_sentences??!!n.trimSentences,r.single_line=t.single_line??!!n.singleLine}else if(e===`instruct`)for(let e of m)r[e]=t[e]??(typeof u().instruct[e]!=`boolean`&&``);else e===`sysprompt`?(r.content=t.content||``,r.post_history=t.post_history||``):(r.prefix=t.prefix||``,r.suffix=t.suffix||``,r.separator=t.separator||``);return r.name=t.name||``,r}var w=e=>C(e,x(S(),e));function T(e){let t=b()[e],n=new Set(t.map(e=>e.name));return[...d[e].map(e=>n.has(e.name)?{...t.find(t=>t.name===e.name),builtin:!0,edited:!0}:{...e,builtin:!0}),...t.filter(t=>!d[e].some(e=>e.name===t.name))]}var E=(e,t)=>T(e).find(e=>e.name===t)||null,D=(e,t)=>d[e].some(e=>e.name===t);function O(e,t){let n=b()[e],r=C(e,t),i=n.findIndex(e=>e.name===r.name);return i>=0?n[i]=r:n.push(r),l.set({}),r}function k(e,t){let n=b();n[e]=n[e].filter(e=>e.name!==t),l.set({})}function A(e,t){let n=S(),r=E(e,t);if(!r)return!1;let i=x(n,e);if(e===`context`){for(let e of p)r[e]!==void 0&&(i[e]=r[e]);r.always_force_name2!==void 0&&(n.alwaysForceName2=!!r.always_force_name2),r.trim_sentences!==void 0&&(n.trimSentences=!!r.trim_sentences),r.single_line!==void 0&&(n.singleLine=!!r.single_line)}else if(e===`instruct`){for(let e of m)r[e]!==void 0&&(i[e]=r[e]);i.bind_to_context&&E(`context`,t)&&A(`context`,t)}else e===`sysprompt`?(i.content=r.content||``,i.post_history=r.post_history||``):(i.prefix=r.prefix||``,i.suffix=r.suffix||``,i.separator=r.separator||``);return i.name=t,l.set({}),!0}function j(e){let t=w(e),n=E(e,t.name);if(!n)return!0;let r=C(e,n);return Object.keys(t).some(e=>String(t[e]??``)!==String(r[e]??``))}var M=e=>{e={...e},e.separator_sequence!==void 0&&(e.output_suffix=e.separator_sequence||``,delete e.separator_sequence),e.names!==void 0&&(e.names_behavior=e.names?`always`:e.names_force_groups?`force`:`none`);let t={input_suffix:``,system_sequence:``,system_suffix:``,user_alignment_message:``,last_system_sequence:``,first_input_sequence:``,last_input_sequence:``,first_output_sequence:``,last_output_sequence:``,stop_sequence:``,activation_regex:``,skip_examples:!1,system_same_as_user:!1,names_behavior:`force`,sequences_as_stop_strings:!0,story_string_prefix:``,story_string_suffix:``,wrap:!0,macro:!0};for(let n in t)e[n]===void 0&&(e[n]=t[n]);return e},N=e=>!!e&&typeof e==`object`,P=e=>N(e)?`input_sequence`in e&&`output_sequence`in e?`instruct`:`story_string`in e?`context`:`content`in e&&`name`in e&&typeof e.content==`string`&&!(`prompts`in e)&&!(`role`in e)&&!(`keys`in e)?`sysprompt`:`prefix`in e&&`suffix`in e&&`separator`in e?`reasoning`:``:``;function F(e,t=``){let n=t.replace(/\.json$/i,``),i=[],a=S(),o=(e,t)=>{let a=u(),o=e===`instruct`?M(t):e===`context`?{...a.context,always_force_name2:a.alwaysForceName2,trim_sentences:!1,single_line:!1,...t}:t,s=t.name||n||r(`advanced.imported`),c=d[e].find(e=>e.name===s);if(c&&!b()[e].some(e=>e.name===s)&&JSON.stringify(C(e,{...o,name:s}))===JSON.stringify(C(e,c)))return i.push({kind:e,name:s,same:!0});i.push({kind:e,name:O(e,{...o,name:s}).name})},s=P(e),c=e;if(c?.power_user)return I(c.power_user);if(s)o(s,e);else if(N(e)){for(let t in f)P(e[t])===t&&(o(t,e[t]),A(t,i[i.length-1].name));let t=e.srw;N(t)&&`value`in t&&(a.startReplyWith=t.value||``,a.showBias=!!t.show,i.push({kind:`srw`,name:r(`advanced.srw`)})),l.set({})}if(!i.length)throw Error(r(`advanced.err.notTpl`));return i}function I(e){let t=S(),n=[],i=e=>e!=null;if(e.instruct&&typeof e.instruct==`object`){let r=M(e.instruct);for(let e of m)i(r[e])&&(t.instruct[e]=r[e]);t.instruct.enabled=!!e.instruct.enabled,t.instruct.bind_to_context=!!e.instruct.bind_to_context,t.instruct.name=e.instruct.preset||e.instruct.name||``,n.push({kind:`instruct`,name:t.instruct.name})}if(e.context&&typeof e.context==`object`){for(let n of p)i(e.context[n])&&(t.context[n]=e.context[n]);t.context.name=e.context.preset||e.context.name||``,n.push({kind:`context`,name:t.context.name})}if(e.sysprompt&&typeof e.sysprompt==`object`&&(t.sysprompt={enabled:e.sysprompt.enabled!==!1,name:e.sysprompt.name||``,content:e.sysprompt.content||``,post_history:e.sysprompt.post_history||``},n.push({kind:`sysprompt`,name:t.sysprompt.name||``})),e.reasoning&&typeof e.reasoning==`object`){let r=e.reasoning;t.reasoning={...t.reasoning,name:r.name||``,autoParse:!!r.auto_parse,autoExpand:!!r.auto_expand,addToPrompts:!!r.add_to_prompts,maxAdditions:r.max_additions??1,prefix:r.prefix||``,suffix:r.suffix||``,separator:r.separator||``},n.push({kind:`reasoning`,name:t.reasoning.name||``})}try{let n=JSON.parse(e.custom_stopping_strings||`[]`);Array.isArray(n)&&(t.stopStrings=n.filter(e=>typeof e==`string`&&!!e).map(e=>e.replace(/\n/g,`\\n`)))}catch{}for(let[n,r]of Object.entries({custom_stopping_strings_macro:`stopMacro`,token_padding:`tokenPadding`,always_force_name2:`alwaysForceName2`,single_line:`singleLine`,collapse_newlines:`collapseNewlines`,trim_spaces:`trimSpaces`,trim_sentences:`trimSentences`,auto_fix_generated_markdown:`fixMarkdown`,user_prompt_bias:`startReplyWith`,show_user_prompt_bias:`showBias`,markdown_escape_strings:`mdEscape`}))i(e[n])&&(t[r]=e[n]);return e.model_templates_mappings&&typeof e.model_templates_mappings==`object`&&(t.modelMap={...t.modelMap||{},...Object.fromEntries(Object.entries(e.model_templates_mappings).map(([e,t])=>[e,{instruct:t?.instruct||``,context:t?.context||``}]))}),n.push({kind:`settings`,name:r(`advanced.misc`)}),l.set({}),n}var L=()=>{let e=S();return{instruct:w(`instruct`),context:w(`context`),sysprompt:w(`sysprompt`),reasoning:w(`reasoning`),srw:{value:e.startReplyWith||``,show:e.showBias!==!1}}},R=e=>{try{let t=String(e).match(/^\/([\s\S]+)\/([a-z]*)$/);return t?new RegExp(t[1],t[2]):new RegExp(e,`i`)}catch{return null}},z=e=>h[e]||e||``,B=[`text`,`kobold`,`horde`,`novelai`];function V(e){let t=S(),n=e?.instruct||``,i=e?.model||``,a=null,o=t.context,s=``,c=e=>{let n=e&&E(`context`,e);return n?{...t.context,...n}:null};if(n===`plain`)s=r(`advanced.why.plain`);else if(n===`custom`)a=t.instruct,s=r(`advanced.why.custom`);else if(n&&E(`instruct`,h[n]||n))a=E(`instruct`,h[n]||n),s=r(`advanced.why.conn`);else if(t.modelMap?.[i]){let e=t.modelMap[i];a=e.instruct?e.instruct===t.instruct.name?t.instruct:E(`instruct`,e.instruct):null,o=e.context!==t.context.name&&c(e.context)||t.context,s=r(`advanced.why.model`)}else if(t.instruct.enabled&&(a=t.instruct,i)){for(let e of T(`instruct`))if(e.activation_regex&&R(e.activation_regex)?.test(i)){e.name!==t.instruct.name&&(a=e,s=r(`advanced.why.regex`,{rx:e.activation_regex}),t.instruct.bind_to_context&&c(e.name)&&(o=c(e.name)));break}}return e?.context&&c(e.context)?o=c(e.context):n&&n!==`plain`&&n!==`custom`&&a&&t.instruct.bind_to_context&&c(a.name)&&a.name!==t.context.name&&(o=c(a.name)),{instruct:a,context:o,why:s}}function H(e,t){let n=/\{\{\s*(#if|#unless|else|\/if|\/unless)\s*([^{}]*?)\s*\}\}/g,r=(e,i,a)=>{let o=``,s=null,c=i,l;for(n.lastIndex=i;l=n.exec(e);){let i=e.slice(c,l.index);if(s===null?o+=i:s+=i,c=n.lastIndex,l[1]===`#if`||l[1]===`#unless`){let[i,a]=r(e,c,l[1]===`#if`?`/if`:`/unless`),u=!!t[l[2]]==(l[1]===`#if`)?i.yes:i.no;s===null?o+=u:s+=u,c=a,n.lastIndex=a}else if(l[1]===`else`&&a)s=``;else if(l[1]===a)return[{yes:o,no:s||``},c]}let u=e.slice(c);return s===null?o+=u:s+=u,[{yes:o,no:s||``},e.length]};return r(String(e||``),0,``)[0].yes.replace(/\{\{\s*([A-Za-z]\w*)\s*\}\}/g,(e,n)=>Object.hasOwn(t,n)?String(t[n]??``):e)}function U(e,t,n,r=e=>e){let i=r(H(e.story_string,n)).replace(/^\n+/,``);return i.length&&!i.endsWith(`
`)&&+e.story_string_position!=1&&(!t||t.wrap&&!t.story_string_suffix)&&(i+=`
`),i}function W(e,t,n,r=e=>e){return!n||!e||+t.story_string_position==1?n||``:(e.story_string_prefix&&(n=r(e.story_string_prefix).replace(/\{\{name\}\}/gi,`System`)+(e.wrap?`
`:``)+n),e.story_string_suffix&&(n+=r(e.story_string_suffix)),n)}function G(e,{name:t,mes:n,isUser:r,isNarrator:i,force:a=0,group:o=!1,user:s,mx:c=e=>e}){let l=!i&&(e.names_behavior===`always`||e.names_behavior===`force`&&o&&t!==s),u=(i?e.system_same_as_user?e.input_sequence:e.system_sequence:r?a===1?e.first_input_sequence||e.input_sequence:a===2&&e.last_input_sequence||e.input_sequence:a===1?e.first_output_sequence||e.output_sequence:a===2&&e.last_output_sequence||e.output_sequence)||``,d=(i?e.system_same_as_user?e.input_suffix:e.system_suffix:r?e.input_suffix:e.output_suffix)||``;return e.macro&&(u=c(u).replace(/\{\{name\}\}/gi,t||`System`),d=c(d).replace(/\{\{name\}\}/gi,t||`System`)),!d&&e.wrap&&(d=`
`),(l&&t?[u,`${t}: ${n}`+d]:[u,n+d]).filter(e=>e).join(e.wrap?`
`:``)}function K(e,{name:t,isImpersonate:n=!1,isQuiet:r=!1,bias:i=``,group:a=!1,mx:o=e=>e}){let s=!!t&&!r&&(e.names_behavior===`always`||a&&e.names_behavior===`force`),c=(n?e.last_input_sequence||e.input_sequence:r?e.last_system_sequence||e.output_sequence:e.last_output_sequence||e.output_sequence)||``,l=``;s&&e.last_output_sequence&&e.output_sequence&&c===e.last_output_sequence&&/\s$/.test(e.output_sequence)&&!/\s$/.test(e.last_output_sequence)&&(l=e.output_sequence.slice(-1)),e.macro&&(c=o(c).replace(/\{\{name\}\}/gi,t||`System`));let u=e.wrap?`
`:``,d=s?u+c+u+l+`${t}:`:u+c;return!n&&i&&(d+=s?i:u+i.trimStart()),(e.wrap?d.trimEnd():d)+(s?``:u)}function q(e,t,n,r=e=>e){if(!e||!e.trim()||e.trim()===`<START>`)return[];e.startsWith(`<START>`)||(e=`<START>
`+e.trim());let i=t?`<START>
`:n.example_separator?r(n.example_separator)+`
`:``;return e.split(/<START>/gi).slice(1).map(e=>`${i}${e.trim()}\n`)}function J(e,{user:t,char:n,group:r,groupNames:i=[],withNames:a}){let o=[],s=e.split(`
`),c=i.map(e=>e+`:`),l=[],u=!1,d=!1,f=n,p=(e,t)=>{let n=l.join(`
`).replace(e+`:`,``).trim();a&&r&&(n=`${e}: ${n}`),o.push({who:t,content:n}),l=[]};for(let e=1;e<s.length;e++){let r=s[e];r.startsWith(t+`:`)?(d&&p(f,`bot`),u=!0,d=!1):(r.startsWith(n+`:`)||c.some(e=>r.startsWith(e)))&&(u&&p(t,`user`),!r.startsWith(n+`:`)&&c.length&&(f=r.split(`:`)[0]),d=!0,u=!1),l.push(r)}return u?p(t,`user`):d&&p(f,`bot`),o}function Y(e,t,n,{user:r,char:i,group:a=!1,groupNames:o=[],mx:s=e=>e}){let c=t.example_separator?s(t.example_separator)+`
`:``,l=()=>n.map(e=>e.replace(/<START>\n/i,c));if(e.skip_examples)return l();let u=e.names_behavior===`always`,d=a&&[`always`,`force`].includes(e.names_behavior),f=e.input_sequence||``,p=e.output_sequence||``,m=e.input_suffix||``,h=e.output_suffix||``;e.macro&&(f=s(f).replace(/\{\{name\}\}/gi,r),p=s(p).replace(/\{\{name\}\}/gi,i),m=s(m).replace(/\{\{name\}\}/gi,r),h=s(h).replace(/\{\{name\}\}/gi,i),!m&&e.wrap&&(m=`
`),!h&&e.wrap&&(h=`
`));let g=e.wrap?`
`:``,_=[];for(let t of n){let n=J(t.replace(/<START>/i,`{Example Dialogue:}`).replace(/\r/g,``),{user:r,char:i,group:a,groupNames:a?o:[],withNames:d});if(n.length){c&&_.push(c);for(let t of n){let n=t.who===`user`,a=!d&&(u||e.names_behavior===`force`&&n);_.push([n?f:p,(a?`${n?r:i}: ${t.content}`:t.content)+(n?m:h)].filter(e=>e).join(g))}}}return _.length?_:l()}function X(e,{user:t,char:n,mx:r=e=>e}){let i=[],a=(e,t)=>String(e||``).replace(/\{\{name\}\}/gi,t),o=[e.stop_sequence||``];e.sequences_as_stop_strings&&o.push(a(e.input_sequence,t),a(e.output_sequence,n),a(e.first_output_sequence,n),a(e.last_output_sequence,n),a(e.system_sequence,`System`),a(e.last_system_sequence,`System`));for(let t of v(o.join(`
`).split(`
`)))t.trim()&&i.push(e.macro?r((e.wrap?`
`:``)+t):(e.wrap?`
`:``)+t);return i}function Z(e){if(!e)return``;let t=new Set([`.`,`!`,`?`,`*`,`"`,`)`,`}`,"`",`]`,`$`,`。`,`！`,`？`,`”`,`）`,`】`,`’`,`」`,`_`,`…`,`~`,`』`]),n=Array.from(e),r=-1;for(let e=n.length-1;e>=0;e--){let i=n[e],a=/(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u.test(i);if(t.has(i)||a){r=!a&&e>0&&/\s/.test(n[e-1])?e-1:e;break}}return r===-1?e.trimEnd():n.slice(0,r+1).join(``).trimEnd()}function Q(e,{I:t,stops:n=[],user:r,char:i,isImpersonate:a=!1}){for(let t of n){if(!t)continue;let n=t.trim()?e.indexOf(t):-1;n>=0&&(e=e.slice(0,n));for(let n=t.length-1;n>0;n--)if(e.slice(-n)===t.slice(0,n)){e=e.slice(0,-n);break}}e=e.replace(/[^\S\r\n]+$/gm,``);let o=a?i:r;if(o){e.startsWith(o+`:`)&&(e=``);let t=e.indexOf(`\n${o}:`);t>=0&&(e=e.slice(0,t))}let s=e.indexOf(`<|endoftext|>`);if(s>=0&&(e=e.slice(0,s)),t&&(t.stop_sequence&&e.includes(t.stop_sequence)&&(e=e.slice(0,e.indexOf(t.stop_sequence))),t.input_sequence?.trim()&&e.includes(t.input_sequence)&&(e=e.slice(0,e.indexOf(t.input_sequence))),t.sequences_as_stop_strings))for(let n of a?[t.input_sequence]:[t.output_sequence,t.last_output_sequence])for(let t of String(n||``).split(`
`))t.trim()&&(e=e.split(t).join(``));let c=a?r:i;return c&&(e=e.replace(RegExp(`(^|\\n)${y(c)}:[^\\S\\n]*`,`g`),`$1`)),e}a.filters.push({owner:`core`,fn:e=>{let t=String(l.settings.format?.mdEscape||``).split(`,`).filter(Boolean);return t.length?e.replace(RegExp(`^(${t.map(y).join(`|`)})$`,`gm`),e=>Array.from(e).join(`​`)):e}});export{F as a,a as c,s as d,A as i,o as l,f as n,P as o,c as r,T as s,S as t,i as u};