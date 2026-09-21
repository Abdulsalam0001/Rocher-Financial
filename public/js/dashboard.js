const logout=async()=>{try{await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});}finally{location.href="/login.html"}};
const logoutButton=document.querySelector("#logout");
if(logoutButton)logoutButton.addEventListener("click",logout);
const sidebarLogout=document.querySelector("#sidebarLogout");
if(sidebarLogout)sidebarLogout.addEventListener("click",logout);

const passwordForm=document.querySelector("#changePasswordForm");
if(passwordForm){
  passwordForm.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=document.querySelector("#passwordMessage");
    const data=Object.fromEntries(new FormData(passwordForm));
    if(data.newPassword!==data.confirmPassword){message.textContent="New passwords do not match.";return}
    message.textContent="Changing password...";
    try{
      const r=await fetch("/api/customer/change-password",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({currentPassword:data.currentPassword,newPassword:data.newPassword})});
      const j=await r.json().catch(()=>({}));
      message.textContent=r.ok?"Password changed successfully.":(j.error||"Unable to change password.");
      if(r.ok)passwordForm.reset();
    }catch{message.textContent="Unable to reach customer services. Please try again."}
  });
}