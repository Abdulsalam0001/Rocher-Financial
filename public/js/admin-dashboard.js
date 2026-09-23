const money=(minor,currency)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(minor)/100);
async function get(url){const r=await fetch(url);if(r.status===401){location.href="/admin/login.html";return null}return r.json()}
async function load(){const results=await Promise.all([get("/api/admin/overview"),get("/api/admin/customers"),get("/api/admin/history")]);const o=results[0],c=results[1],h=results[2];if(!o)return;document.querySelector("#customersCount").textContent=o.customers;document.querySelector("#accountsCount").textContent=o.accounts;document.querySelector("#transactionsCount").textContent=o.transactions;document.querySelector("#auditCount").textContent=o.auditLogs;document.querySelector("#customers").innerHTML=(c||[]).map(x=>{const a=x.accounts[0];return "<tr><td><strong>"+x.name+"</strong></td><td>"+x.email+"</td><td>"+(a?a.accountNumber:"—")+"</td><td>"+(a?money(a.balanceMinor,a.currency):"—")+"</td><td class='status'>"+x.status+"</td><td><button class='button small change-password' type='button' data-customer-id='"+x.id+"' data-customer-name='"+x.name+"'>Change password</button></td></tr>"}).join("")||"<tr><td colspan='6'>No customers.</td></tr>";const items=[];(h?.transactions||[]).forEach(x=>items.push({date:x.createdAt,title:"Transaction "+x.reference,detail:x.type+" · "+money(x.amountMinor,x.currency)+" · "+x.status}));(h?.auditLogs||[]).forEach(x=>items.push({date:x.createdAt,title:x.action,detail:x.resource+(x.user?.email?" · "+x.user.email:"")}));(h?.securityEvents||[]).forEach(x=>items.push({date:x.createdAt,title:x.event,detail:x.user?.email||"System"}));items.sort((a,b)=>new Date(b.date)-new Date(a.date));document.querySelector("#historyList").innerHTML=items.slice(0,30).map(x=>"<div class='history-item'><strong>"+x.title+"</strong> — "+x.detail+"<br><small>"+new Date(x.date).toLocaleString()+"</small></div>").join("")||"<p>No activity yet.</p>"}
document.querySelector("#showCreate").onclick=()=>document.querySelector("#createCustomer").scrollIntoView({behavior:"smooth",block:"center"});
document.querySelector("#createCustomer").addEventListener("submit",async e=>{e.preventDefault();const m=document.querySelector("#createMessage");m.textContent="Creating customer…";const body=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch("/api/admin/customers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const j=await r.json();m.textContent=r.ok?"Customer created. Account: "+j.accountNumber:j.error||"Unable to create customer.";if(r.ok){e.currentTarget.reset();await load()}});
document.querySelector("#logout").onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/admin/login.html"};load();
let passwordCustomerId="";
const passwordPanel=document.querySelector("#passwordPanel");
const passwordForm=document.querySelector("#changeCustomerPassword");
const passwordMessage=document.querySelector("#passwordMessage");
document.querySelector("#customers").addEventListener("click",e=>{
  const button=e.target.closest(".change-password");
  if(!button)return;
  passwordCustomerId=button.dataset.customerId;
  document.querySelector("#passwordCustomerLabel").textContent="Set a new password for "+button.dataset.customerName+".";
  passwordMessage.textContent="";
  passwordForm.reset();
  passwordPanel.classList.remove("hidden");
  passwordPanel.scrollIntoView({behavior:"smooth",block:"center"});
});
document.querySelector("#cancelPasswordChange").onclick=()=>{
  passwordPanel.classList.add("hidden");
  passwordCustomerId="";
  passwordForm.reset();
  passwordMessage.textContent="";
};
passwordForm.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!passwordCustomerId)return;
  const body=Object.fromEntries(new FormData(e.currentTarget));
  if(body.newPassword!==body.confirmPassword){passwordMessage.textContent="Passwords do not match.";RMAlert?.warning("Passwords do not match","Enter the same new password in both fields.");return}
  passwordMessage.textContent="Changing password…";
  const r=await fetch("/api/admin/customers/"+encodeURIComponent(passwordCustomerId)+"/password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({newPassword:body.newPassword})});
  if(r.status===401){location.href="/admin/login.html";return}
  const j=await r.json();
  passwordMessage.textContent=r.ok?j.message:(j.error||"Unable to change password.");
  if(r.ok){RMAlert?.success("Password changed",j.message);e.currentTarget.reset();setTimeout(()=>document.querySelector("#cancelPasswordChange").click(),900);await load()}
});

async function loadCurrencySettings(){
  const input=document.querySelector("#supportedCurrencies"), message=document.querySelector("#currencyMessage");
  if(!input)return;
  try{const rows=await get("/api/admin/currencies");if(rows)input.value=rows.filter(x=>x.enabled).map(x=>x.code).join(", ");}
  catch(error){if(message)message.textContent=error.message||"Unable to load currency settings.";}
}
document.querySelector("#currencySettingsForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  const message=document.querySelector("#currencyMessage"), button=e.currentTarget.querySelector("button[type=submit]");
  if(button)button.disabled=true;
  if(message)message.textContent="Saving currencies…";
  try{
    const response=await fetch("/api/admin/currencies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currencies:e.currentTarget.currencies.value})});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Unable to save currencies.");
    if(message)message.textContent="Supported currencies updated.";RMAlert?.success("Currencies updated","Customer beneficiary and account currency options have been updated.");
  }catch(error){if(message)message.textContent=error.message||"Unable to save currencies.";RMAlert?.error("Currency update failed",error.message||"Unable to save currencies.")}
  finally{if(button)button.disabled=false;}
});
loadCurrencySettings();
