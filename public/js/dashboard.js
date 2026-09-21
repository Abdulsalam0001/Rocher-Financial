const money=(minor,currency)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(minor)/100);
async function load(){const r=await fetch("/api/customer/me");if(!r.ok){location.href="/login.html";return}const d=await r.json();document.querySelector("#welcome").textContent="Welcome, "+d.customer.firstName+".";document.querySelector("#email").textContent=d.customer.email;document.querySelector("#accounts").innerHTML=d.accounts.map(a=>"<article class='account-card'><span class='label'>"+a.type+"</span><h3>"+a.currency+" ACCOUNT</h3><div class='balance'>"+money(a.balanceMinor,a.currency)+"</div><div class='account-number'>"+a.accountNumber+" · "+a.status+"</div></article>").join("")||"<p>No accounts available.</p>";document.querySelector("#transactions").innerHTML=d.transactions.map(t=>"<tr><td>"+new Date(t.createdAt).toLocaleDateString()+"</td><td>"+t.reference+"</td><td>"+t.type+"</td><td>"+money(t.amountMinor,t.currency)+"</td><td class='status'>"+t.status+"</td></tr>").join("")||"<tr><td colspan='5'>No transaction history.</td></tr>"}load();
document.querySelector("#logout").onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/login.html"};
const passwordForm=document.querySelector("#changePasswordForm");
if(passwordForm){
  passwordForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=document.querySelector("#passwordMessage");
    const data=Object.fromEntries(new FormData(passwordForm));
    if(data.newPassword!==data.confirmPassword){message.textContent="New passwords do not match.";return}
    message.textContent="Changing password…";
    const r=await fetch("/api/customer/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({currentPassword:data.currentPassword,newPassword:data.newPassword})});
    const j=await r.json();
    message.textContent=r.ok?"Password changed successfully.":(j.error||"Unable to change password.");
    if(r.ok) passwordForm.reset();
  });
}
