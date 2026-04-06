import{j as u}from"./jsx-runtime-Cf8x2fCZ.js";import{fn as de}from"./index-CH2Su9EI.js";import{R as f,r as s}from"./index-tvICUrOf.js";import{f as ue,D as ce,a as j,T as Z,g as pe,V as me,h as ge,i as fe,j as ve,e as v,k as be,m as D,F as L,d as he,q as M}from"./index-DnF_TE3_.js";import{E as ye}from"./index-C9focwmE.js";import"./index-yBjzXJbu.js";import"./index-Dyc2rrkr.js";import"./index-BLHw34Di.js";var Ce=function(n){var r,t,l=n.onClick,d=n.label,i=n.colorConfig,c=n.colorMode,p=ue[c==="light"?"lightComponents":"darkComponents"].dropdown[d?"withLabel":"withoutLabel"],a=ve(i)?p:i??p;return f.createElement(ce,j({className:d?"":"no-label"},a,{onClick:l}),d?f.createElement(f.Fragment,null,f.createElement(Z,j({},pe.th13sb,{color:(r=a==null?void 0:a.text)!==null&&r!==void 0?r:"rgba(255,255,255,0.5)"}),d),f.createElement(me,{n:2})):null,f.createElement(ge,{direction:fe.SOUTH,color:(t=a==null?void 0:a.chevron)!==null&&t!==void 0?t:"rgba(255,255,255,0.5)"}))};const we=M.div`
  position: relative;
  display: inline-block;
  max-width: 100%;
  opacity: ${e=>e.$disabled?.45:1};
  pointer-events: ${e=>e.$disabled?"none":"auto"};
`,Se=M.div`
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + ${e=>e.$offset}px);
  z-index: 20;
`,xe=M.button`
  display: block;
  width: 100%;
  margin: 0;
  padding: 10px 14px;
  border: none;
  text-align: left;
  cursor: pointer;
  background: transparent;
  &:focus-visible {
    outline: 2px solid ${D.yellow};
    outline-offset: -2px;
  }
  &:hover {
    background: ${v.popBlack[300]};
  }
`;function O({options:e,value:n,onChange:r,placeholder:t="Select",disabled:l=!1,colorMode:d="dark",colorConfig:i,margin:c,padding:p,wrapperStyle:a,className:E,menuOffset:re=6,menuBackgroundColor:oe=v.popBlack[200],menuEdgeColors:ne,menuMinWidth:b,menuMaxHeight:h=280}){const[g,y]=s.useState(!1),q=s.useRef(null),T=s.useMemo(()=>e.find(o=>o.value===n),[e,n]),te=(T==null?void 0:T.label)??t,ae=s.useCallback(()=>{l||y(o=>!o)},[l]),le=s.useCallback(o=>{r==null||r(o),y(!1)},[r]);s.useEffect(()=>{if(!g)return;const o=m=>{const B=q.current;B&&!B.contains(m.target)&&y(!1)};return document.addEventListener("mousedown",o),()=>document.removeEventListener("mousedown",o)},[g]),s.useEffect(()=>{if(!g)return;const o=m=>{m.key==="Escape"&&y(!1)};return document.addEventListener("keydown",o),()=>document.removeEventListener("keydown",o)},[g]);const se=s.useMemo(()=>{const o={maxHeight:typeof h=="number"?`${h}px`:h,overflowY:"auto"};return b!=null&&(o.minWidth=typeof b=="number"?`${b}px`:b),o},[h,b]),ie=s.useMemo(()=>({margin:c,padding:p,...a}),[c,p,a]);return u.jsxs(we,{ref:q,$disabled:l,className:E,style:ie,"data-select-dropdown-open":g||void 0,children:[u.jsx(Ce,{onClick:ae,label:te,colorMode:d,colorConfig:i}),g?u.jsx(Se,{$offset:re,role:"listbox",children:u.jsx(ye,{backgroundColor:oe,edgeColors:ne,style:se,fullWidth:!0,children:u.jsx(be,{style:{gap:0},children:e.map(o=>{const m=o.value===n;return u.jsx(xe,{type:"button",role:"option","aria-selected":m,onClick:()=>le(o.value),children:u.jsx(Z,{as:"span",fontType:he.BODY,fontSize:14,fontWeight:m?L.SEMI_BOLD:L.REGULAR,color:m?D.white:"rgba(255,255,255,0.7)",children:o.label})},o.value)})})})}):null]})}O.__docgenInfo={description:"NeoPOP-backed select: `Dropdown` trigger and `ElevatedCard` menu with `Typography` options.\nClick-outside and Escape close the menu; `useEffect` listeners are always cleaned up.",methods:[],displayName:"SelectDropdown",props:{options:{required:!0,tsType:{name:"Array",elements:[{name:"signature",type:"object",raw:`{
  value: string;
  label: string;
}`,signature:{properties:[{key:"value",value:{name:"string",required:!0}},{key:"label",value:{name:"string",required:!0}}]}}],raw:"SelectDropdownOption[]"},description:"Choices shown when the menu is open."},value:{required:!1,tsType:{name:"string"},description:"Currently selected value, if any."},onChange:{required:!1,tsType:{name:"signature",type:"function",raw:"(next: string) => void",signature:{arguments:[{type:{name:"string"},name:"next"}],return:{name:"void"}}},description:"Called when the user picks an option."},placeholder:{required:!1,tsType:{name:"string"},description:"Trigger label when `value` is empty or not in `options`.",defaultValue:{value:"'Select'",computed:!1}},disabled:{required:!1,tsType:{name:"boolean"},description:"Disables opening the menu and dims the control.",defaultValue:{value:"false",computed:!1}},colorMode:{required:!1,tsType:{name:"union",raw:"'dark' | 'light'",elements:[{name:"literal",value:"'dark'"},{name:"literal",value:"'light'"}]},description:"Passed to NeoPOP `Dropdown`.",defaultValue:{value:"'dark'",computed:!1}},colorConfig:{required:!1,tsType:{name:"signature",type:"object",raw:`{
  border?: string;
  text?: string;
  chevron?: string;
}`,signature:{properties:[{key:"border",value:{name:"string",required:!1}},{key:"text",value:{name:"string",required:!1}},{key:"chevron",value:{name:"string",required:!1}}]}},description:"Trigger chrome: border, label, and NeoPOP chevron colors."},margin:{required:!1,tsType:{name:"CSSProperties['margin']",raw:"CSSProperties['margin']"},description:"CSS margin on the outer wrapper (layout spacing in screens and Storybook)."},padding:{required:!1,tsType:{name:"CSSProperties['padding']",raw:"CSSProperties['padding']"},description:"CSS padding on the outer wrapper."},wrapperStyle:{required:!1,tsType:{name:"CSSProperties"},description:"Extra styles for the outer wrapper."},className:{required:!1,tsType:{name:"string"},description:"className on the outer wrapper."},menuOffset:{required:!1,tsType:{name:"number"},description:"Vertical gap between trigger and menu (px).",defaultValue:{value:"6",computed:!1}},menuBackgroundColor:{required:!1,tsType:{name:"string"},description:"Panel background (NeoPOP `ElevatedCard` `backgroundColor`).",defaultValue:{value:"colorPalette.popBlack[200]",computed:!0}},menuEdgeColors:{required:!1,tsType:{name:"signature",type:"object",raw:"{ bottom: string; right: string }",signature:{properties:[{key:"bottom",value:{name:"string",required:!0}},{key:"right",value:{name:"string",required:!0}}]}},description:"Optional elevated edge colors for the menu card."},menuMinWidth:{required:!1,tsType:{name:"union",raw:"number | string",elements:[{name:"number"},{name:"string"}]},description:"Menu panel minimum height (scroll when content exceeds)."},menuMaxHeight:{required:!1,tsType:{name:"union",raw:"number | string",elements:[{name:"number"},{name:"string"}]},description:"Menu panel maximum height with vertical scroll.",defaultValue:{value:"280",computed:!1}}}};const ee=[{value:"inr",label:"INR — Indian Rupee"},{value:"usd",label:"USD — US Dollar"},{value:"eur",label:"EUR — Euro"},{value:"gbp",label:"GBP — Pound Sterling"},{value:"jpy",label:"JPY — Japanese Yen"}];function ke(e){const[n,r]=s.useState(e.value);return s.useEffect(()=>{r(e.value)},[e.value]),u.jsx(O,{...e,value:n,onChange:t=>{var l;r(t),(l=e.onChange)==null||l.call(e,t)}})}function Pe(e){const{triggerBorderColor:n,triggerTextColor:r,triggerChevronColor:t,marginCss:l,paddingCss:d,menuEdgeBottom:i,menuEdgeRight:c,...p}=e,a=n||r||t?{...n?{border:n}:{},...r?{text:r}:{},...t?{chevron:t}:{}}:void 0,E=i!=null&&i!==""&&c!=null&&c!==""?{bottom:i,right:c}:void 0;return{...p,margin:l===""?void 0:l,padding:d===""?void 0:d,colorConfig:a,menuEdgeColors:E}}const Le={title:"NeoPOP/SelectDropdown",component:O,parameters:{layout:"centered",docs:{description:{component:"NeoPOP `Dropdown` trigger plus `ElevatedCard` menu. Trigger border, label, and chevron colors map to NeoPOP `colorConfig`; chevron geometry comes from NeoPOP `Chevron` (not swappable for a Lucide icon without replacing the trigger primitive)."}}},argTypes:{options:{control:"object",description:"Menu entries `{ value, label }[]`"},value:{control:"text"},placeholder:{control:"text"},disabled:{control:"boolean"},colorMode:{control:"select",options:["dark","light"]},triggerBorderColor:{control:"color"},triggerTextColor:{control:"color"},triggerChevronColor:{control:"color"},marginCss:{control:"text",description:"Outer wrapper CSS margin (e.g. `16px`, `8px 12px`)"},paddingCss:{control:"text",description:"Outer wrapper CSS padding"},wrapperStyle:{control:"object",description:"Forwarded as `style` on outer wrapper (after margin/padding)"},className:{control:"text"},menuOffset:{control:{type:"number",min:0,max:32,step:1}},menuBackgroundColor:{control:"color"},menuEdgeBottom:{control:"color"},menuEdgeRight:{control:"color"},menuMinWidth:{control:{type:"number",min:120,max:480,step:4},description:"Optional min-width (px); leave 0 to use full trigger width only"},menuMaxHeight:{control:{type:"number",min:120,max:400,step:4},description:"Max height (px) before scroll"},onChange:{action:"change"}},args:{options:ee,value:void 0,placeholder:"Currency",disabled:!1,colorMode:"dark",triggerBorderColor:"rgba(255,255,255,0.2)",triggerTextColor:D.white,triggerChevronColor:"rgba(255,255,255,0.5)",marginCss:"",paddingCss:"",wrapperStyle:{},className:void 0,menuOffset:6,menuBackgroundColor:v.popBlack[200],menuEdgeBottom:v.rss[700],menuEdgeRight:v.rss[800],menuMinWidth:0,menuMaxHeight:280,onChange:de()},render:e=>{const n=Pe(e),r=e.menuMinWidth,t=typeof r=="number"&&r>0?r:void 0;return u.jsx(ke,{...n,menuMinWidth:t})}},C={name:"Playground"},w={name:"With selection",args:{value:"eur"}},S={args:{value:"inr",disabled:!0}},x={name:"Light color mode",args:{colorMode:"light",value:"usd"}},k={name:"Margin & padding",args:{marginCss:"24px",paddingCss:"16px",wrapperStyle:{background:v.popBlack[400],borderRadius:8}}},P={name:"Scrollable menu",args:{menuMaxHeight:140,options:[...ee,{value:"chf",label:"CHF — Swiss Franc"},{value:"aud",label:"AUD — Australian Dollar"},{value:"cad",label:"CAD — Canadian Dollar"},{value:"sek",label:"SEK — Swedish Krona"}]}};var N,R,$;C.parameters={...C.parameters,docs:{...(N=C.parameters)==null?void 0:N.docs,source:{originalSource:`{
  name: 'Playground'
}`,...($=(R=C.parameters)==null?void 0:R.docs)==null?void 0:$.source}}};var V,A,_;w.parameters={...w.parameters,docs:{...(V=w.parameters)==null?void 0:V.docs,source:{originalSource:`{
  name: 'With selection',
  args: {
    value: 'eur'
  }
}`,...(_=(A=w.parameters)==null?void 0:A.docs)==null?void 0:_.source}}};var F,W,U;S.parameters={...S.parameters,docs:{...(F=S.parameters)==null?void 0:F.docs,source:{originalSource:`{
  args: {
    value: 'inr',
    disabled: true
  }
}`,...(U=(W=S.parameters)==null?void 0:W.docs)==null?void 0:U.source}}};var H,I,K;x.parameters={...x.parameters,docs:{...(H=x.parameters)==null?void 0:H.docs,source:{originalSource:`{
  name: 'Light color mode',
  args: {
    colorMode: 'light',
    value: 'usd'
  }
}`,...(K=(I=x.parameters)==null?void 0:I.docs)==null?void 0:K.source}}};var Y,G,z;k.parameters={...k.parameters,docs:{...(Y=k.parameters)==null?void 0:Y.docs,source:{originalSource:`{
  name: 'Margin & padding',
  args: {
    marginCss: '24px',
    paddingCss: '16px',
    wrapperStyle: {
      background: colorPalette.popBlack[400],
      borderRadius: 8
    }
  }
}`,...(z=(G=k.parameters)==null?void 0:G.docs)==null?void 0:z.source}}};var J,Q,X;P.parameters={...P.parameters,docs:{...(J=P.parameters)==null?void 0:J.docs,source:{originalSource:`{
  name: 'Scrollable menu',
  args: {
    menuMaxHeight: 140,
    options: [...SAMPLE_OPTIONS, {
      value: 'chf',
      label: 'CHF — Swiss Franc'
    }, {
      value: 'aud',
      label: 'AUD — Australian Dollar'
    }, {
      value: 'cad',
      label: 'CAD — Canadian Dollar'
    }, {
      value: 'sek',
      label: 'SEK — Swedish Krona'
    }]
  }
}`,...(X=(Q=P.parameters)==null?void 0:Q.docs)==null?void 0:X.source}}};const Ne=["Playground","WithValue","Disabled","LightTrigger","PaddedLayout","TallMenu"];export{S as Disabled,x as LightTrigger,k as PaddedLayout,C as Playground,P as TallMenu,w as WithValue,Ne as __namedExportsOrder,Le as default};
