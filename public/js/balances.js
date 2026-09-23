const money=(minor,currency)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(minor)/100);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
async function load(){const r=await fetch("/api/admin/balances");if(r.status===401){location.href="/admin/login.html";return}const d=await r.json();if(!r.ok){document.querySelector("#balanceMessage").textContent=d.error||"Unable to load balances.";return}
document.querySelector("#accountCount").textContent=d.accounts.length;document.querySelector("#historyCount").textContent=d.history.length;document.querySelector("#creditCount").textContent=d.history.filter(x=>x.direction==="CREDIT").length;document.querySelector("#debitCount").textContent=d.history.filter(x=>x.direction==="DEBIT").length;
document.querySelector("#accountId").innerHTML='<option value="">Select account</option>'+d.accounts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.accountNumber)+' — '+esc(a.customer?.name||"Unassigned")+' — '+money(a.balanceMinor,a.currency)+'</option>').join("");
document.querySelector("#accounts").innerHTML=d.accounts.map(a=>'<tr><td><strong>'+esc(a.customer?.name||"Unassigned")+'</strong></td><td>'+esc(a.accountNumber)+'</td><td>'+esc(a.type)+'</td><td>'+esc(a.currency)+'</td><td>'+money(a.balanceMinor,a.currency)+'</td><td class="status">'+esc(a.status)+'</td></tr>').join("")||'<tr><td colspan="6">No accounts.</td></tr>';
document.querySelector("#history").innerHTML=d.history.map(x=>'<tr><td>'+new Date(x.createdAt).toLocaleString()+'</td><td>'+esc(x.customer)+'</td><td>'+esc(x.accountNumber)+'</td><td><span class="balance-direction '+x.direction.toLowerCase()+'">'+esc(x.direction)+'</span></td><td>'+money(x.amountMinor,x.currency)+'</td><td>'+esc(x.description||"—")+'</td><td class="status">'+esc(x.status)+'</td></tr>').join("")||'<tr><td colspan="7">No credit or debit history.</td></tr>'}
document.querySelector("#balanceForm").addEventListener("submit",async e=>{e.preventDefault();const m=document.querySelector("#balanceMessage");m.textContent="Posting adjustment…";const body=Object.fromEntries(new FormData(e.currentTarget));
if(body.effectiveAt){
  const local=new Date(String(body.effectiveAt));
  if(Number.isNaN(local.getTime())){m.textContent="Enter a valid transaction date.";return}
  body.effectiveAt=local.toISOString();
}
const r=await fetch("/api/admin/balances/adjust",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
const j=await r.json();
m.textContent=r.ok?(body.effectiveAt?"Historical adjustment posted. Reference: ":"Adjustment posted. Reference: ")+j.reference:j.error||"Unable to post adjustment.";if(r.ok){e.currentTarget.reset();await load()}});
document.querySelector("#logout").onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/admin/login.html"};load();