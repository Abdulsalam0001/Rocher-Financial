(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const S={data:null,bens:[],pin:false,pending:null,hide:false};
const money=(n,c)=>{try{return new Intl.NumberFormat(undefined,{style:"currency",currency:c}).format(Number(n)/100)}catch{return c+" "+Number(n)/100}};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(u,o={}){const r=await fetch(u,{headers:{"Content-Type":"application/json"},...o}),j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(j.error||"Request failed"),{data:j});return j}
function modal(id,on){$(id).classList.toggle("hidden",!on);document.body.classList.toggle("modal-open",on)}
function alertModal(title,message,eyebrow="ROCHER MUTUEL"){$("#alertEyebrow").textContent=eyebrow;$("#alertTitle").textContent=title;$("#alertMessage").textContent=message;modal("#alertModal",true)}
function render(){
 const A=S.data.accounts||[],a=A[0],total=a?A.filter(x=>x.currency===a.currency).reduce((n,x)=>n+Number(x.balanceMinor),0):0;
 $("#accountsGrid").innerHTML=A.map(x=>"<article class='account-card'><div class='account-card-top'><span class='label'>"+esc(x.type)+"</span><span class='account-status'>"+esc(x.status)+"</span></div><h3>"+x.currency+" ACCOUNT</h3><div class='balance'>"+(S.hide?"******":money(x.balanceMinor,x.currency))+"</div><div class='account-number'>"+esc(x.accountNumber)+"</div></article>").join("")||"<p>No accounts available.</p>";
 $("#totalBalance").textContent=S.hide?"******":money(total,a?.currency||"EUR");$("#availableCash").textContent=S.hide?"******":money(total,a?.currency||"EUR");
 $("#accountCount").textContent=A.length;$("#baseCurrency").textContent=a?.currency||"EUR";$("#primaryAccount").textContent=a?(a.currency+" · "+a.accountNumber):"Primary account";
 $("#pendingCount").textContent=(S.data.transactions||[]).filter(x=>["PENDING","PROCESSING"].includes(x.status)).length;
}
function fill(){
 const A=S.data.accounts||[];
 $("#sourceAccount").innerHTML=A.map(a=>"<option value='"+a.id+"'>"+a.currency+" · "+a.accountNumber+" · "+money(a.balanceMinor,a.currency)+"</option>").join("");
 $("#beneficiary").innerHTML=S.bens.map(b=>"<option value='"+b.id+"'>"+esc(b.name)+" · "+esc(b.bankName)+" · "+b.currency+"</option>").join("");
 $("#beneficiaryList").innerHTML=S.bens.map(b=>"<button class='beneficiary' type='button' data-bid='"+b.id+"'><span class='beneficiary-avatar'>"+esc(b.name[0])+"</span><span><strong>"+esc(b.name)+"</strong><small>"+esc(b.bankName)+" · "+esc(b.country)+"</small></span><b>></b></button>").join("")||"<div class='empty-state'>No beneficiaries yet. Add a recipient to start a transfer.</div>";
}
function preview(){const a=S.data.accounts.find(x=>x.id===$("#sourceAccount").value),b=S.bens.find(x=>x.id===$("#beneficiary").value),n=Number($("#transferAmount").value||0);$("#transferPreview").innerHTML=a&&b?"<span>From <b>"+a.currency+" · "+a.accountNumber+"</b></span><span>To <b>"+esc(b.name)+"</b></span><span>Bank <b>"+esc(b.bankName)+"</b></span>"+(b.iban?"<span>IBAN <b>"+esc(b.iban)+"</b></span>":"")+(b.swiftBic?"<span>SWIFT/BIC <b>"+esc(b.swiftBic)+"</b></span>":"")+(n?"<span>Amount <b>"+money(n*100,a.currency)+"</b></span>":""):"<span>Add a beneficiary to begin.</span>"}
function openTransfer(type,bid){
 if(!S.pin){alertModal("Transfer PIN pending","Your Transfer PIN is issued by Rocher Mutuel Financial. Please contact customer care before initiating a transfer.","TRANSFER SECURITY");return}
 modal("#transferModal",true);$("#transferType").value=type||"WIRE";fill();if(bid)$("#beneficiary").value=bid;preview()
}
async function load(){
 const r=await fetch("/api/customer/me");if(!r.ok)return location.href="/login.html";S.data=await r.json();
 render();try{S.bens=await api("/api/customer/beneficiaries")}catch(x){alertModal("Beneficiaries unavailable",x.message,"ACCOUNT NOTICE")}fill();
 try{const p=await api("/api/customer/transfer-pin");S.pin=p.configured;$("#pinStatus").textContent=S.pin?"PIN issued":"PIN pending";$("#pinStatus").className="status-pill "+(S.pin?"completed":"pending")}catch{}
}
$("[data-open-transfer]").forEach(x=>x.onclick=()=>openTransfer(x.dataset.openTransfer));
["#transferType","#sourceAccount","#beneficiary","#transferAmount"].forEach(x=>$(x).addEventListener("input",preview));
$$("[data-close-modal]").forEach(x=>x.onclick=()=>modal("#"+x.dataset.closeModal,false));
$("#transferForm").onsubmit=e=>{
 e.preventDefault();const a=S.data.accounts.find(x=>x.id===$("#sourceAccount").value),b=S.bens.find(x=>x.id===$("#beneficiary").value),n=Number($("#transferAmount").value);
 if(!a||!b||n<=0){$("#transferMessage").textContent="Complete the transfer details.";return}
 S.pending={sourceAccountId:a.id,beneficiaryId:b.id,transferType:$("#transferType").value,amount:n,reference:$("#transferReference").value.trim()};
 $("#confirmationSummary").innerHTML="<div><span>Method</span><strong>"+S.pending.transferType+"</strong></div><div><span>Beneficiary</span><strong>"+esc(b.name)+"</strong></div><div><span>Bank</span><strong>"+esc(b.bankName)+"</strong></div><div><span>Amount</span><strong>"+money(n*100,a.currency)+"</strong></div>";
 modal("#transferModal",false);modal("#confirmModal",true)
};
$("#confirmForm").onsubmit=async e=>{
 e.preventDefault();$("#confirmMessage").textContent="Authorizing transfer...";
 try{
 const j=await api("/api/customer/transfers",{method:"POST",body:JSON.stringify({...S.pending,transferPin:$("#transferPin").value})});
 modal("#confirmModal",false);location.href="/transfer-processing.html?reference="+encodeURIComponent(j.reference);
 }catch(x){modal("#confirmModal",false);location.href="/transfer-failed.html?reason="+encodeURIComponent(x.data?.message||x.message||"The transfer could not be completed.")}
};
$("#beneficiaryForm").onsubmit=async e=>{
 e.preventDefault();try{await api("/api/customer/beneficiaries",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});S.bens=await api("/api/customer/beneficiaries");fill();modal("#beneficiaryModal",false);alertModal("Beneficiary saved","The recipient is now available for transfers.","RECIPIENT")}catch(x){modal("#beneficiaryModal",false);alertModal("Could not save beneficiary",x.message,"RECIPIENT")}
};
$("#openBeneficiary").onclick=$("#openBeneficiary2").onclick=()=>modal("#beneficiaryModal",true);
$("#beneficiaryList").onclick=e=>{const b=e.target.closest("[data-bid]");if(b)openTransfer("WIRE",b.dataset.bid)};
$("#toggleBalance").onclick=()=>{S.hide=!S.hide;render()};
load()
$("[data-close-modal]").forEach(x=>x.onclick=()=>modal("#"+x.dataset.closeModal,false));
})()