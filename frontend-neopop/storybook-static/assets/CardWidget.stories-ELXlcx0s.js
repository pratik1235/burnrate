import{j as t}from"./jsx-runtime-Cf8x2fCZ.js";import"./index-tvICUrOf.js";import{m as s,T as r,F as n,d as a}from"./index-DnF_TE3_.js";import{f as g}from"./utils-BwT5Bhai.js";import{B as O}from"./types-l8WkrWZd.js";import{C as q}from"./credit-card-CQk773tI.js";import"./index-yBjzXJbu.js";import"./index-Dyc2rrkr.js";import"./index-BLHw34Di.js";import"./createLucideIcon-BJ4bm9dH.js";function o({bank:I,last4:v,totalSpend:w,spendLines:p,transactionCount:u,className:D}){const m=O[I];return t.jsxs("div",{style:{padding:20,minWidth:280,border:"1px solid rgba(255,255,255,0.08)",borderRadius:12},className:D,children:[t.jsxs("div",{style:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16},children:[t.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[t.jsx("div",{style:{width:40,height:40,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",backgroundColor:m.color,color:s.white,fontWeight:700,fontSize:14},children:m.logo}),t.jsxs("div",{children:[t.jsx(r,{fontType:a.BODY,fontSize:14,fontWeight:n.SEMI_BOLD,color:s.white,children:m.name}),t.jsxs(r,{fontType:a.BODY,fontSize:12,fontWeight:n.REGULAR,color:"rgba(255,255,255,0.6)",children:["...",v]})]})]}),t.jsx(q,{size:18,color:"rgba(255,255,255,0.5)"})]}),t.jsx("div",{style:{marginBottom:4},children:p&&p.length>0?p.slice().sort((e,A)=>e.currency.localeCompare(A.currency)).map(e=>t.jsx(r,{fontType:a.BODY,fontSize:20,fontWeight:n.BOLD,color:s.white,children:g(e.amount,e.currency)},e.currency)):t.jsx(r,{fontType:a.BODY,fontSize:24,fontWeight:n.BOLD,color:s.white,children:g(w)})}),t.jsxs(r,{fontType:a.BODY,fontSize:12,fontWeight:n.REGULAR,color:"rgba(255,255,255,0.6)",children:[u," transaction",u!==1?"s":""]})]})}o.__docgenInfo={description:"",methods:[],displayName:"CardWidget",props:{bank:{required:!0,tsType:{name:"Bank"},description:""},last4:{required:!0,tsType:{name:"string"},description:""},totalSpend:{required:!0,tsType:{name:"number"},description:""},spendLines:{required:!1,tsType:{name:"Array",elements:[{name:"signature",type:"object",raw:"{ amount: number; currency: string }",signature:{properties:[{key:"amount",value:{name:"number",required:!0}},{key:"currency",value:{name:"string",required:!0}}]}}],raw:"{ amount: number; currency: string }[]"},description:"When multiple currency rows exist for this card"},transactionCount:{required:!0,tsType:{name:"number"},description:""},className:{required:!1,tsType:{name:"string"},description:""}}};const N=Object.keys(O),K={title:"NeoPOP/CardWidget",component:o,parameters:{layout:"centered"},argTypes:{bank:{control:"select",options:N},last4:{control:"text"},totalSpend:{control:"number"},spendLines:{control:"object",description:"When set and non-empty, replaces single totalSpend display"},transactionCount:{control:"number"},className:{control:"text"}}},i={args:{bank:"hdfc",last4:"4521",totalSpend:124500,transactionCount:23}},c={args:{bank:"icici",last4:"7890",totalSpend:89200,transactionCount:15}},d={args:{bank:"axis",last4:"3344",totalSpend:45600,transactionCount:8}},l={args:{bank:"hdfc",last4:"4521",totalSpend:124500,transactionCount:23},render:()=>t.jsxs("div",{style:{display:"flex",gap:16,flexWrap:"wrap"},children:[t.jsx(o,{bank:"hdfc",last4:"4521",totalSpend:124500,transactionCount:23}),t.jsx(o,{bank:"icici",last4:"7890",totalSpend:89200,transactionCount:15}),t.jsx(o,{bank:"axis",last4:"3344",totalSpend:45600,transactionCount:8})]})};var f,y,h;i.parameters={...i.parameters,docs:{...(f=i.parameters)==null?void 0:f.docs,source:{originalSource:`{
  args: {
    bank: 'hdfc',
    last4: '4521',
    totalSpend: 124500,
    transactionCount: 23
  }
}`,...(h=(y=i.parameters)==null?void 0:y.docs)==null?void 0:h.source}}};var C,x,b;c.parameters={...c.parameters,docs:{...(C=c.parameters)==null?void 0:C.docs,source:{originalSource:`{
  args: {
    bank: 'icici',
    last4: '7890',
    totalSpend: 89200,
    transactionCount: 15
  }
}`,...(b=(x=c.parameters)==null?void 0:x.docs)==null?void 0:b.source}}};var S,j,k;d.parameters={...d.parameters,docs:{...(S=d.parameters)==null?void 0:S.docs,source:{originalSource:`{
  args: {
    bank: 'axis',
    last4: '3344',
    totalSpend: 45600,
    transactionCount: 8
  }
}`,...(k=(j=d.parameters)==null?void 0:j.docs)==null?void 0:k.source}}};var W,T,B;l.parameters={...l.parameters,docs:{...(W=l.parameters)==null?void 0:W.docs,source:{originalSource:`{
  args: {
    bank: 'hdfc',
    last4: '4521',
    totalSpend: 124500,
    transactionCount: 23
  },
  render: () => <div style={{
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap'
  }}>
      <CardWidget bank="hdfc" last4="4521" totalSpend={124500} transactionCount={23} />
      <CardWidget bank="icici" last4="7890" totalSpend={89200} transactionCount={15} />
      <CardWidget bank="axis" last4="3344" totalSpend={45600} transactionCount={8} />
    </div>
}`,...(B=(T=l.parameters)==null?void 0:T.docs)==null?void 0:B.source}}};const U=["HDFC","ICICI","Axis","AllCards"];export{l as AllCards,d as Axis,i as HDFC,c as ICICI,U as __namedExportsOrder,K as default};
