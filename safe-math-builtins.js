// Closed, pure numeric built-ins. Never executes user C or loads libraries.
const SafeMathBuiltins = (() => {
  'use strict';
  const registry = Object.freeze({sin:Math.sin, cos:Math.cos, tan:Math.tan});
  const names = Object.freeze(['sin','cos','tan']);
  const limits = Object.freeze({expressionCharacters:2048, expressionTokens:256,
    expressionDepth:32, nesting:4, callsPerExpression:16, runtimeCalls:10000,
    argumentMagnitude:1000000});
  let activeBudget = null;
  const isName = name => Object.prototype.hasOwnProperty.call(registry,name);
  function withBudget(run){
    const previous=activeBudget;
    activeBudget={calls:0};
    try{return run();}finally{activeBudget=previous;}
  }
  function evaluate(name, argument){
    if(!isName(name)) return {ok:false,error:'未登録の数学関数です。sin/cos/tanだけを使用してください。'};
    if(typeof argument!=='number' || !Number.isFinite(argument)) return {ok:false,error:'数学関数の引数は有限のdouble値でなければなりません。'};
    if(Math.abs(argument)>limits.argumentMagnitude) return {ok:false,error:'数学関数の引数はラジアンの絶対値1000000以下にしてください。これはLiteの安全・精度上限です。'};
    if(activeBudget && activeBudget.calls>=limits.runtimeCalls) return {ok:false,error:'数学関数の実行回数が安全上限10000に達しました。'};
    if(activeBudget) activeBudget.calls++;
    // Registry is closed; dispatch never reads an input-named Math property.
    const value=name==='sin' ? registry.sin(argument) : name==='cos' ? registry.cos(argument) : registry.tan(argument);
    if(!Number.isFinite(value)) return {ok:false,error:'数学関数の戻り値が有限のdouble値ではありません。'};
    return {ok:true,value,type:'double'};
  }
  return Object.freeze({names,limits,isName,evaluate,withBudget});
})();
if(typeof module==='object' && module.exports) module.exports=SafeMathBuiltins;
