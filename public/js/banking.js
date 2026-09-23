(()=>{
  "use strict";
  const $=s=>document.querySelector(s);
  const $$=s=>[...document.querySelectorAll(s)];
  const S={data:null,bens:[],pin:false,pending:null,hide:false,loading:true};
  const money=(minor,currency)=>{try{return new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(minor||0)/100)}catch{return currency+" "+(Number(minor||0)/100).toFixed(2)}};
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>c==="&"?"&amp;":c==="<"?"&lt;":c===">"?"&gt;":c==="\""?"&quot;":"&#39;");
  const escText=v=>esc(String(v??""));
  const api=async(url,options={})=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(url,{credentials:"same-origin",...options,signal:controller.signal});
      const raw=await response.text();
      let data={};try{data=raw?JSON.parse(raw):{}}catch{}
      if(!response.ok)throw Object.assign(new Error(data.error||data.message||`Request failed (${response.status})`),{status:response.status,data});
      return data;
    }catch(error){
      if(error.name==="AbortError")throw new Error("The banking service took too long to respond. Please try again.");
      throw error;
    }finally{clearTimeout(timer)}
  };
  const modal=(id,on)=>{const el=$(id);if(el)el.classList.toggle("hidden",!on);document.body.classList.toggle("modal-open",on)};
  const alertModal=(title,message,eyebrow="ROCHER MUTUEL FINANCIAL")=>{
    const e=$("#alertEyebrow"),t=$("#alertTitle"),m=$("#alertMessage");
    if(e)e.textContent=eyebrow;if(t)t.textContent=title;if(m)m.textContent=message;modal("#alertModal",true);
  };
  const setDashboardStatus=(message,type="info")=>{
    let el=$("#dashboardDataStatus");
    if(!el){
      el=document.createElement("div");el.id="dashboardDataStatus";el.className="dashboard-data-status";
      const target=$(".hero-dashboard");if(target)target.insertAdjacentElement("afterend",el);
    }
    el.dataset.type=type;
    const icon=type==="error"?"!":"✓";
    const retry=type==="error"?'<button type="button" id="retryDashboard">Retry</button>':"";
    el.innerHTML='<span>'+icon+"</span>"+esc(message)+retry;
    if(type==="error")$("#retryDashboard")?.addEventListener("click",load,{once:true});
  };
  const render=()=>{
    const accounts=Array.isArray(S.data?.accounts)?S.data.accounts:[];
    const transactions=Array.isArray(S.data?.transactions)?S.data.transactions:[];
    const primary=accounts[0];
    const primaryTotal=primary?Number(S.data?.balancesByCurrency?.[primary.currency]??accounts.filter(a=>a.currency===primary.currency).reduce((sum,a)=>sum+Number(a.balanceMinor||0),0)):0;
    const grid=$("#accountsGrid");
    if(grid)grid.innerHTML=accounts.length?accounts.map(a=>`<article class="account-card"><div class="account-card-top"><span class="label">${esc(a.type)}</span><span class="account-status">${esc(a.status)}</span></div><h3>${esc(a.currency)} ACCOUNT</h3><div class="balance">${S.hide?"••••••":money(a.balanceMinor,a.currency)}</div><div class="account-number">${esc(a.accountNumber)}</div></article>`).join(""):`<div class="empty-state">No accounts are currently available. Please contact customer care.</div>`;
    if($("#welcome"))$("#welcome").textContent=`Welcome, ${S.data?.customer?.firstName||"Client"}.`;
    if($("#email"))$("#email").textContent=S.data?.customer?.email||"";
    if($("#totalBalance"))$("#totalBalance").textContent=S.hide?"••••••":money(primaryTotal,primary?.currency||"EUR");
    if($("#availableCash"))$("#availableCash").textContent=S.hide?"••••••":money(primaryTotal,primary?.currency||"EUR");
    if($("#accountCount"))$("#accountCount").textContent=String(accounts.length);
    if($("#baseCurrency"))$("#baseCurrency").textContent=primary?.currency||"EUR";
    if($("#primaryAccount"))$("#primaryAccount").textContent=primary?`${primary.currency} · ${primary.accountNumber}`:"Primary account";
    if($("#pendingCount"))$("#pendingCount").textContent=String(transactions.filter(t=>["PENDING","PROCESSING"].includes(t.status)).length);
    const tx=$("#transactions");
    if(tx)tx.innerHTML=transactions.length?transactions.map(t=>`<tr><td class="transaction-amount">${money(t.amountMinor,t.currency)}</td><td>${esc(t.description||t.type)}</td><td>${new Date(t.createdAt).toLocaleDateString()}</td><td class="mono">${esc(t.reference)}</td><td><span class="status-pill ${String(t.status||"").toLowerCase()}">${esc(t.status)}</span></td></tr>`).join(""):`<tr><td colspan="5"><div class="empty-state">No transaction activity is available yet.</div></td></tr>`;
  };
  const fill=()=>{
    const accounts=Array.isArray(S.data?.accounts)?S.data.accounts:[];
    const source=$("#sourceAccount"),beneficiary=$("#beneficiary"),list=$("#beneficiaryList");
    if(source)source.innerHTML=accounts.map(a=>`<option value="${esc(a.id)}">${esc(a.currency)} · ${esc(a.accountNumber)} · ${money(a.balanceMinor,a.currency)}</option>`).join("");
    if(beneficiary)beneficiary.innerHTML=S.bens.length?S.bens.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.bankName)} · ${esc(b.currency)}</option>`).join(""):`<option value="">Add a beneficiary first</option>`;
    if(list)list.innerHTML=S.bens.length?S.bens.map(b=>`<button class="beneficiary" type="button" data-bid="${esc(b.id)}"><span class="beneficiary-avatar">${esc((b.name||"?").charAt(0).toUpperCase())}</span><span><strong>${esc(b.name)}</strong><small>${esc(b.bankName)} · ${esc(b.country)}</small></span><b>›</b></button>`).join(""):`<div class="empty-state">No beneficiaries yet. Add a recipient to start a transfer.</div>`;
  };
  const preview=()=>{
    const accountId=$("#sourceAccount")?.value,beneficiaryId=$("#beneficiary")?.value;
    const account=(S.data?.accounts||[]).find(a=>a.id===accountId),beneficiary=S.bens.find(b=>b.id===beneficiaryId),amount=Number($("#transferAmount")?.value||0);
    const box=$("#transferPreview");if(!box)return;
    if(!account||!beneficiary){box.innerHTML="<span>Add a beneficiary to begin.</span>";return}
    const conversion=beneficiary.currency!==account.currency;
    box.innerHTML=`<span>From <b>${esc(account.currency)} · ${esc(account.accountNumber)}</b></span><span>To <b>${esc(beneficiary.name)}</b></span><span>Bank <b>${esc(beneficiary.bankName)}</b></span>${beneficiary.iban?`<span>IBAN <b>${esc(beneficiary.iban)}</b></span>`:""}${beneficiary.swiftBic?`<span>SWIFT/BIC <b>${esc(beneficiary.swiftBic)}</b></span>`:""}${amount?`<span>Amount <b>${money(amount*100,account.currency)}</b></span>`:""}${conversion?`<span class="transfer-warning">Currency conversion: ${esc(account.currency)} → ${esc(beneficiary.currency)}</span>`:""}`;
    const fee=$("#transferFeeNotice");if(fee){fee.classList.toggle("hidden",!conversion);fee.innerHTML=conversion?`<strong>Currency conversion service fee applies</strong>A service fee will be deducted from the source account for the ${esc(account.currency)} → ${esc(beneficiary.currency)} conversion. The applicable charge will be shown/confirmed before processing.`:"";}
  };
  const openTransfer=(type,bid)=>{
    if(!S.data){setDashboardStatus("Your banking data is still loading.","loading");return}
    if(!S.pin){location.href="/transfer-pin-pending.html";return}
    modal("#transferModal",true);if($("#transferType"))$("#transferType").value=type||"WIRE";fill();if(bid&&$("#beneficiary"))$("#beneficiary").value=bid;preview();
  };
  async function load(){
    S.loading=true;setDashboardStatus("Loading your accounts, balances and recent activity...","loading");
    try{
      const me=await api("/api/customer/me");
      if(!me?.customer)throw new Error("Customer profile could not be loaded.");
      S.data=me;render();
      const results=await Promise.allSettled([api("/api/customer/beneficiaries"),api("/api/customer/transfer-pin")]);
      if(results[0].status==="fulfilled")S.bens=Array.isArray(results[0].value)?results[0].value:[];else S.bens=[];
      if(results[1].status==="fulfilled"){S.pin=Boolean(results[1].value.configured);}
      fill();
      setDashboardStatus(S.data.accounts.length ? "Account data updated securely." : "No accounts are linked to this customer yet.","success");
      setTimeout(()=>$("#dashboardDataStatus")?.remove(),3000);
    }catch(error){
      if(error.status===401||error.status===403){location.href="/login.html";return}
      setDashboardStatus(error.message||"We could not load your banking data.","error");
    }finally{S.loading=false}
  }
  $$("[data-open-transfer]").forEach(el=>el.addEventListener("click",()=>openTransfer(el.dataset.openTransfer)));
  ["#transferType","#sourceAccount","#beneficiary","#transferAmount"].forEach(sel=>$(sel)?.addEventListener("input",preview));
  $$("[data-close-modal]").forEach(el=>el.addEventListener("click",()=>modal("#"+el.dataset.closeModal,false)));
  $("#transferForm")?.addEventListener("submit",e=>{
    e.preventDefault();
    const account=(S.data?.accounts||[]).find(a=>a.id===$("#sourceAccount")?.value),beneficiary=S.bens.find(b=>b.id===$("#beneficiary")?.value),amount=Number($("#transferAmount")?.value);
    const message=$("#transferMessage");
    if(!account||!beneficiary||amount<=0){if(message)message.textContent="Complete the transfer details.";return}
    
    if(amount*100>Number(account.balanceMinor)){if(message)message.textContent="The transfer amount exceeds the available balance.";return}
    S.pending={sourceAccountId:account.id,beneficiaryId:beneficiary.id,transferType:$("#transferType").value,amount,reference:$("#transferReference").value.trim(),sourceCurrency:account.currency,targetCurrency:beneficiary.currency};
    const conversion=beneficiary.currency!==account.currency;
    $("#confirmationSummary").innerHTML=`<div><span>Method</span><strong>${esc(S.pending.transferType)}</strong></div><div><span>From</span><strong>${esc(account.currency)} · ${esc(account.accountNumber)}</strong></div><div><span>Beneficiary</span><strong>${esc(beneficiary.name)}</strong></div><div><span>Bank</span><strong>${esc(beneficiary.bankName)}</strong></div><div><span>Amount</span><strong>${money(amount*100,account.currency)}</strong></div>${conversion?`<div class="conversion-confirmation"><span>Currency conversion</span><strong>${esc(account.currency)} → ${esc(beneficiary.currency)}</strong><small>A currency-conversion service fee will be deducted from the source account before processing. The applicable charge will be confirmed before processing.</small></div>`:""}`;
    $("#transferPin").value="";$("#confirmMessage").textContent="";modal("#transferModal",false);modal("#confirmModal",true);setTimeout(()=>$("#transferPin")?.focus(),50);
  });
  $("#confirmForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const message=$("#confirmMessage"),button=e.currentTarget.querySelector("button[type=submit]");
    if(!S.pending)return;if(button)button.disabled=true;if(message)message.textContent="Authorizing transfer securely...";
    try{const j=await api("/api/customer/transfers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...S.pending,transferPin:$("#transferPin").value})});modal("#confirmModal",false);location.href="/transfer-processing.html?reference="+encodeURIComponent(j.reference)}
    catch(error){if(button)button.disabled=false;if(message)message.textContent=error.data?.message||error.message||"The transfer could not be completed.";if(error.status===401)$("#transferPin").select()}
  });
  $("#beneficiaryForm")?.addEventListener("submit",async e=>{
    e.preventDefault();const form=e.currentTarget,message=$("#beneficiaryMessage"),button=form.querySelector("button[type=submit]");if(button)button.disabled=true;if(message)message.textContent="Saving recipient...";
    try{await api("/api/customer/beneficiaries",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(form)))});S.bens=await api("/api/customer/beneficiaries");fill();form.reset();modal("#beneficiaryModal",false);alertModal("Beneficiary saved","The recipient is now available for transfers.","RECIPIENT")}catch(error){if(message)message.textContent=error.message||"Unable to save beneficiary."}finally{if(button)button.disabled=false}
  });
  const openBeneficiary=()=>modal("#beneficiaryModal",true);$("#openBeneficiary")?.addEventListener("click",openBeneficiary);$("#openBeneficiary2")?.addEventListener("click",openBeneficiary);
  $("#beneficiaryList")?.addEventListener("click",e=>{const item=e.target.closest("[data-bid]");if(item)openTransfer("WIRE",item.dataset.bid)});
  $("#toggleBalance")?.addEventListener("click",()=>{S.hide=!S.hide;const b=$("#toggleBalance");if(b)b.setAttribute("aria-label",S.hide?"Show balances":"Hide balances");render()});
  const mobileNav=$("#mobileNavToggle"),clientNav=$(".client-nav");
  mobileNav?.addEventListener("click",()=>{const open=clientNav?.classList.toggle("open");mobileNav.setAttribute("aria-expanded",String(Boolean(open)));mobileNav.setAttribute("aria-label",open?"Close banking menu":"Open banking menu");mobileNav.classList.toggle("open",Boolean(open));});
  clientNav?.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>{clientNav.classList.remove("open");mobileNav?.classList.remove("open");mobileNav?.setAttribute("aria-expanded","false");}));
  load();
})();