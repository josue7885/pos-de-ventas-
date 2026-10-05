(function(root){
  const cents=value=>Math.round((Number(value)+Number.EPSILON)*100);
  const quantity=value=>Math.round(Number(value)*1000);
  function totals(items, rate=.13, percent=0) {
    const grossCents=items.reduce((sum,item)=>sum+Math.round(cents(item.price)*quantity(item.qty)/1000),0);
    const discountCents=Math.round(grossCents*Math.round(Number(percent)*100)/10000);
    const subtotalCents=grossCents-discountCents;
    const taxCents=Math.round(subtotalCents*Number(rate));
    return {gross: grossCents/100, discount:discountCents/100, subtotal:subtotalCents/100,tax:taxCents/100,total:(subtotalCents+taxCents)/100};
  }
  const api={cents,quantity,totals};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.PosMath=api;
})(typeof window==='undefined'?globalThis:window);
