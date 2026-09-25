let customers=[];
const select=document.querySelector("#customerId");
const details=document.querySelector("#customerDetails");
const confirmationWrap=document.querySelector("#confirmationWrap");
const confirmation=document.querySelector("#deleteConfirmation");
const button=document.querySelector("#deleteCustomerButton");
const message=document.querySelector("#deleteCustomerMessage");

const money=(minor,currency)=>new Intl.NumberFormat(undefined,{style:"currency",currency}).format(Number(minor)/100);

function selectedCustomer(){
  return customers.find(x=>x.id===select.value)||null;
}

function renderCustomer(){
  const customer=selectedCustomer();
  if(!customer){
    details.classList.add("hidden");
    confirmationWrap.classList.add("hidden");
    confirmation.value="";
    button.disabled=true;
    return;
  }
  const account=customer.accounts?.[0];
  document.querySelector("#customerName").textContent=customer.name||"—";
  document.querySelector("#customerEmail").textContent=customer.email||"—";
  document.querySelector("#customerAccount").textContent=account?.accountNumber||"—";
  document.querySelector("#customerBalance").textContent=account?money(account.balanceMinor,account.currency):"—";
  details.classList.remove("hidden");
  confirmationWrap.classList.remove("hidden");
  confirmation.value="";
  button.disabled=true;
}

async function loadCustomers(){
  const response=await fetch("/api/admin/customers");
  if(response.status===401){location.href="/admin/login.html";return}
  if(!response.ok)throw new Error("Unable to load customers.");
  customers=await response.json();
  select.innerHTML="<option value=''>Choose a customer…</option>"+customers.map(x=>"<option value='"+String(x.id).replace(/'/g,"&#39;")+"'>"+escapeHtml(x.name)+" — "+escapeHtml(x.email)+"</option>").join("");
}

function escapeHtml(value){
  return String(value??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
}

select.addEventListener("change",renderCustomer);
confirmation.addEventListener("input",()=>{
  confirmation.value=confirmation.value.toUpperCase();
  button.disabled=confirmation.value!=="DELETE"||!selectedCustomer();
});

document.querySelector("#deleteCustomerForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const customer=selectedCustomer();
  if(!customer||confirmation.value!=="DELETE")return;

  const confirmed=window.Swal
    ? await Swal.fire({
        title:"Permanently delete this customer?",
        text:customer.name+" and their connected account records will be removed.",
        icon:"warning",
        showCancelButton:true,
        confirmButtonText:"Yes, delete customer",
        cancelButtonText:"Cancel",
        confirmButtonColor:"#b42318",
        focusCancel:true
      }).then(result=>result.isConfirmed)
    : window.confirm("Permanently delete "+customer.name+" and their account records?");

  if(!confirmed)return;

  button.disabled=true;
  message.textContent="Deleting customer…";
  try{
    const response=await fetch("/api/admin/customers/"+encodeURIComponent(customer.id),{method:"DELETE"});
    const data=await response.json();
    if(response.status===401){location.href="/admin/login.html";return}
    if(!response.ok)throw new Error(data.error||"Unable to delete customer.");
    RMAlert?.success("Customer deleted","The customer and related account records were removed.");
    message.textContent="Customer deleted successfully.";
    customers=customers.filter(x=>x.id!==customer.id);
    select.innerHTML="<option value=''>Choose a customer…</option>"+customers.map(x=>"<option value='"+String(x.id).replace(/'/g,"&#39;")+"'>"+escapeHtml(x.name)+" — "+escapeHtml(x.email)+"</option>").join("");
    select.value="";
    renderCustomer();
  }catch(error){
    message.textContent=error.message||"Unable to delete customer.";
    RMAlert?.error("Delete failed",error.message||"Unable to delete customer.");
    button.disabled=false;
  }
});

document.querySelector("#logout").addEventListener("click",async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/admin/login.html"});

loadCustomers().catch(error=>{
  message.textContent=error.message||"Unable to load customers.";
  RMAlert?.error("Could not load customers",error.message||"Please refresh and try again.");
});