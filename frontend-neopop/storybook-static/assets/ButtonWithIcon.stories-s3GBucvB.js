import{j as i}from"./jsx-runtime-Cf8x2fCZ.js";import{fn as C}from"./index-CH2Su9EI.js";import{F as o,d as y}from"./index-DnF_TE3_.js";import{B as A,P as K}from"./plus-CcyJe0oF.js";import{R as B}from"./refresh-cw-Dm6XA1tl.js";import{U as D}from"./upload-WCmPbMy7.js";import"./index-yBjzXJbu.js";import"./index-tvICUrOf.js";import"./index-Dyc2rrkr.js";import"./index-BLHw34Di.js";import"./index-Bz6ypOvL.js";import"./createLucideIcon-BJ4bm9dH.js";const M=["flex-start","center","flex-end","stretch","baseline"],R=["flex-start","center","flex-end","space-between","space-around","space-evenly"],U=["nowrap","wrap","wrap-reverse"],O={upload:D,plus:K,refresh:B},E=[o.THIN,o.REGULAR,o.MEDIUM,o.SEMI_BOLD,o.BOLD,o.EXTRA_BOLD];function z(e){const{iconKey:I,labelFontType:l,labelFontSize:c,labelFontWeight:p,labelColor:a,labelAs:d,children:T,...W}=e,m={...l!=null?{fontType:l}:{},...c!=null?{fontSize:c}:{},...p!=null?{fontWeight:p}:{},...a!=null&&a!==""?{color:a}:{},...d!=null?{as:d}:{}},j=Object.keys(m).length>0||e.labelTypographyProps?{...m,...e.labelTypographyProps}:void 0;return i.jsx(A,{...W,icon:O[I],labelTypographyProps:j,children:T})}const ee={title:"NeoPOP/ButtonWithIcon",component:A,parameters:{layout:"centered"},argTypes:{iconKey:{control:"select",options:Object.keys(O),description:"Lucide icon (story-only control)"},children:{control:"text"},variant:{control:"select",options:["primary","secondary"]},kind:{control:"select",options:["elevated","flat","link"]},size:{control:"select",options:["big","medium","small"]},colorMode:{control:"select",options:["dark","light"]},showArrow:{control:"boolean"},fullWidth:{control:"boolean"},disabled:{control:"boolean"},gap:{control:{type:"number",min:0,max:32,step:1}},iconSize:{control:{type:"number",min:8,max:48,step:1}},alignItems:{control:"select",options:M},justifyContent:{control:"select",options:R},flexWrap:{control:"select",options:[...U]},rowProps:{control:"object",description:"Forwarded to NeoPOP `Row` (overrides gap/alignment when set)"},iconProps:{control:"object"},labelTypographyProps:{control:"object",description:"Raw `labelTypographyProps` (merged with labelFont* below if both set)"},labelFontType:{control:"select",options:Object.values(y)},labelFontSize:{control:{type:"number",min:8,max:32,step:1}},labelFontWeight:{control:"select",options:[...E]},labelColor:{control:"color"},labelAs:{control:"select",options:["p","span"]},type:{control:"select",options:["button","submit","reset"]},onClick:{action:"clicked"}},args:{children:"Upload PDF",iconKey:"upload",gap:6,iconSize:14,variant:"primary",kind:"elevated",size:"big",colorMode:"dark",alignItems:"center",justifyContent:"space-around",showArrow:!1,fullWidth:!1,disabled:!1,type:"button",onClick:C(),iconProps:{},rowProps:{},labelTypographyProps:void 0,labelFontType:y.BODY,labelFontSize:14,labelFontWeight:o.MEDIUM,labelColor:void 0,labelAs:void 0},render:e=>z(e)},n={name:"Playground"},L=i.jsx("style",{children:"@keyframes storybook-button-with-icon-spin { to { transform: rotate(360deg); } }"}),r={name:"Primary",args:{children:"Upload PDF",iconKey:"upload",variant:"primary",kind:"elevated",size:"big"}},t={name:"Secondary small",args:{children:"Add offer",iconKey:"plus",variant:"secondary",kind:"elevated",size:"small"}},s={name:"Animated icon",render:e=>i.jsxs(i.Fragment,{children:[L,z({...e,iconKey:"refresh",children:"Sync in progress",iconProps:{style:{animation:"storybook-button-with-icon-spin 1s linear infinite"}}})]}),args:{children:"Sync in progress",iconKey:"refresh",variant:"primary",kind:"elevated",size:"medium",iconProps:{style:{animation:"storybook-button-with-icon-spin 1s linear infinite"}}}};var u,b,h;n.parameters={...n.parameters,docs:{...(u=n.parameters)==null?void 0:u.docs,source:{originalSource:`{
  name: 'Playground'
}`,...(h=(b=n.parameters)==null?void 0:b.docs)==null?void 0:h.source}}};var f,g,P;r.parameters={...r.parameters,docs:{...(f=r.parameters)==null?void 0:f.docs,source:{originalSource:`{
  name: 'Primary',
  args: {
    children: 'Upload PDF',
    iconKey: 'upload',
    variant: 'primary',
    kind: 'elevated',
    size: 'big'
  }
}`,...(P=(g=r.parameters)==null?void 0:g.docs)==null?void 0:P.source}}};var v,S,k;t.parameters={...t.parameters,docs:{...(v=t.parameters)==null?void 0:v.docs,source:{originalSource:`{
  name: 'Secondary small',
  args: {
    children: 'Add offer',
    iconKey: 'plus',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small'
  }
}`,...(k=(S=t.parameters)==null?void 0:S.docs)==null?void 0:k.source}}};var w,x,F;s.parameters={...s.parameters,docs:{...(w=s.parameters)==null?void 0:w.docs,source:{originalSource:`{
  name: 'Animated icon',
  render: (args: StoryArgs) => <>
      {spinStyle}
      {renderButtonWithIcon({
      ...args,
      iconKey: 'refresh',
      children: 'Sync in progress',
      iconProps: {
        style: {
          animation: 'storybook-button-with-icon-spin 1s linear infinite'
        }
      }
    })}
    </>,
  args: {
    children: 'Sync in progress',
    iconKey: 'refresh',
    variant: 'primary',
    kind: 'elevated',
    size: 'medium',
    iconProps: {
      style: {
        animation: 'storybook-button-with-icon-spin 1s linear infinite'
      }
    }
  }
}`,...(F=(x=s.parameters)==null?void 0:x.docs)==null?void 0:F.source}}};const oe=["Playground","Primary","SecondarySmall","AnimatedIcon"];export{s as AnimatedIcon,n as Playground,r as Primary,t as SecondarySmall,oe as __namedExportsOrder,ee as default};
