import{j as e}from"./jsx-runtime-Cf8x2fCZ.js";import{fn as F}from"./index-CH2Su9EI.js";import{B as r}from"./index-Bz6ypOvL.js";import"./index-tvICUrOf.js";import"./index-DnF_TE3_.js";import{B as s,P as A}from"./plus-CcyJe0oF.js";import{U as I}from"./upload-WCmPbMy7.js";import{R as D}from"./refresh-cw-Dm6XA1tl.js";import"./index-yBjzXJbu.js";import"./index-Dyc2rrkr.js";import"./index-BLHw34Di.js";import"./createLucideIcon-BJ4bm9dH.js";const E=["bottom-right","top-right","bottom-left","top-left","bottom-center","top-center","right-center","left-center"],Q={title:"NeoPOP/Button",component:r,parameters:{layout:"centered"},argTypes:{children:{control:"text"},variant:{control:"select",options:["primary","secondary"]},kind:{control:"select",options:["elevated","flat","link"]},size:{control:"select",options:["big","medium","small"]},colorMode:{control:"select",options:["dark","light"]},disabled:{control:"boolean"},showArrow:{control:"boolean"},fullWidth:{control:"boolean"},elevationDirection:{control:"select",options:[...E]},colorConfig:{control:"object",description:"Override NeoPOP button colors"},textStyle:{control:"object",description:"Typography props (fontType, fontSize, fontWeight, …)"},spacingConfig:{control:"object",description:"padding, height, iconHeight"},style:{control:"object"},className:{control:"text"},type:{control:"select",options:["button","submit","reset"]},title:{control:"text"},icon:{control:"text",description:"NeoPOP icon key (elevated/flat buttons)"},onClick:{action:"clicked"}},args:{onClick:F(),type:"button"}},o={args:{children:"Save & Continue",variant:"primary",kind:"elevated",size:"big",colorMode:"dark"}},a={args:{children:"Cancel",variant:"secondary",kind:"flat",size:"medium",colorMode:"dark"}},i={args:{children:"Upload Statement",variant:"primary",kind:"flat",size:"big",colorMode:"dark"}},n={args:{children:"This Month",variant:"secondary",kind:"elevated",size:"small",colorMode:"dark"}},t={args:{children:"Continue",variant:"primary",kind:"elevated",size:"big",colorMode:"dark",showArrow:!0}},l={args:{children:"Processing...",variant:"primary",kind:"elevated",size:"big",colorMode:"dark",disabled:!0}},U=e.jsx("style",{children:"@keyframes storybook-button-spin { to { transform: rotate(360deg); } }"}),d={render:()=>e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:24},children:[U,e.jsxs("div",{style:{display:"flex",gap:12,flexWrap:"wrap"},children:[e.jsx(r,{variant:"primary",kind:"elevated",size:"big",colorMode:"dark",onClick:()=>{},children:"Primary Elevated"}),e.jsx(r,{variant:"secondary",kind:"elevated",size:"big",colorMode:"dark",onClick:()=>{},children:"Secondary Elevated"}),e.jsx(r,{variant:"primary",kind:"flat",size:"big",colorMode:"dark",onClick:()=>{},children:"Primary Flat"}),e.jsx(r,{variant:"secondary",kind:"flat",size:"big",colorMode:"dark",onClick:()=>{},children:"Secondary Flat"})]}),e.jsxs("div",{style:{display:"flex",gap:12,flexWrap:"wrap"},children:[e.jsx(r,{variant:"primary",kind:"elevated",size:"small",colorMode:"dark",onClick:()=>{},children:"Small"}),e.jsx(r,{variant:"primary",kind:"elevated",size:"medium",colorMode:"dark",onClick:()=>{},children:"Medium"}),e.jsx(r,{variant:"primary",kind:"elevated",size:"big",colorMode:"dark",onClick:()=>{},children:"Big"})]}),e.jsxs("div",{style:{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"},children:[e.jsx(s,{icon:I,variant:"primary",kind:"elevated",size:"medium",colorMode:"dark",iconSize:16,onClick:()=>{},children:"Upload PDF"}),e.jsx(s,{icon:A,variant:"secondary",kind:"elevated",size:"medium",colorMode:"dark",iconSize:16,onClick:()=>{},children:"Add Card"}),e.jsx(s,{icon:D,variant:"primary",kind:"elevated",size:"small",colorMode:"dark",iconProps:{style:{animation:"storybook-button-spin 1s linear infinite"}},onClick:()=>{},children:"Syncing"})]})]})};var c,p,m;o.parameters={...o.parameters,docs:{...(c=o.parameters)==null?void 0:c.docs,source:{originalSource:`{
  args: {
    children: 'Save & Continue',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark'
  }
}`,...(m=(p=o.parameters)==null?void 0:p.docs)==null?void 0:m.source}}};var k,y,v;a.parameters={...a.parameters,docs:{...(k=a.parameters)==null?void 0:k.docs,source:{originalSource:`{
  args: {
    children: 'Cancel',
    variant: 'secondary',
    kind: 'flat',
    size: 'medium',
    colorMode: 'dark'
  }
}`,...(v=(y=a.parameters)==null?void 0:y.docs)==null?void 0:v.source}}};var u,g,h;i.parameters={...i.parameters,docs:{...(u=i.parameters)==null?void 0:u.docs,source:{originalSource:`{
  args: {
    children: 'Upload Statement',
    variant: 'primary',
    kind: 'flat',
    size: 'big',
    colorMode: 'dark'
  }
}`,...(h=(g=i.parameters)==null?void 0:g.docs)==null?void 0:h.source}}};var f,b,x;n.parameters={...n.parameters,docs:{...(f=n.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    children: 'This Month',
    variant: 'secondary',
    kind: 'elevated',
    size: 'small',
    colorMode: 'dark'
  }
}`,...(x=(b=n.parameters)==null?void 0:b.docs)==null?void 0:x.source}}};var z,M,C;t.parameters={...t.parameters,docs:{...(z=t.parameters)==null?void 0:z.docs,source:{originalSource:`{
  args: {
    children: 'Continue',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
    showArrow: true
  }
}`,...(C=(M=t.parameters)==null?void 0:M.docs)==null?void 0:C.source}}};var S,B,P;l.parameters={...l.parameters,docs:{...(S=l.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    children: 'Processing...',
    variant: 'primary',
    kind: 'elevated',
    size: 'big',
    colorMode: 'dark',
    disabled: true
  }
}`,...(P=(B=l.parameters)==null?void 0:B.docs)==null?void 0:P.source}}};var j,W,w;d.parameters={...d.parameters,docs:{...(j=d.parameters)==null?void 0:j.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: 24
  }}>
      {spinKeyframes}
      <div style={{
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }}>
        <Button variant="primary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Primary Elevated
        </Button>
        <Button variant="secondary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Secondary Elevated
        </Button>
        <Button variant="primary" kind="flat" size="big" colorMode="dark" onClick={() => {}}>
          Primary Flat
        </Button>
        <Button variant="secondary" kind="flat" size="big" colorMode="dark" onClick={() => {}}>
          Secondary Flat
        </Button>
      </div>
      <div style={{
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap'
    }}>
        <Button variant="primary" kind="elevated" size="small" colorMode="dark" onClick={() => {}}>
          Small
        </Button>
        <Button variant="primary" kind="elevated" size="medium" colorMode="dark" onClick={() => {}}>
          Medium
        </Button>
        <Button variant="primary" kind="elevated" size="big" colorMode="dark" onClick={() => {}}>
          Big
        </Button>
      </div>
      <div style={{
      display: 'flex',
      gap: 12,
      flexWrap: 'wrap',
      alignItems: 'center'
    }}>
        <ButtonWithIcon icon={Upload} variant="primary" kind="elevated" size="medium" colorMode="dark" iconSize={16} onClick={() => {}}>
          Upload PDF
        </ButtonWithIcon>
        <ButtonWithIcon icon={Plus} variant="secondary" kind="elevated" size="medium" colorMode="dark" iconSize={16} onClick={() => {}}>
          Add Card
        </ButtonWithIcon>
        <ButtonWithIcon icon={RefreshCw} variant="primary" kind="elevated" size="small" colorMode="dark" iconProps={{
        style: {
          animation: 'storybook-button-spin 1s linear infinite'
        }
      }} onClick={() => {}}>
          Syncing
        </ButtonWithIcon>
      </div>
    </div>
}`,...(w=(W=d.parameters)==null?void 0:W.docs)==null?void 0:w.source}}};const X=["PrimaryElevated","SecondaryFlat","PrimaryFlat","Small","WithArrow","Disabled","AllVariants"];export{d as AllVariants,l as Disabled,o as PrimaryElevated,i as PrimaryFlat,a as SecondaryFlat,n as Small,t as WithArrow,X as __namedExportsOrder,Q as default};
