const demoProfiles=[
  ["Alexandre","Moreau","alexandre.moreau","+377 6 40 12 83","Monaco"],
  ["Sofia","Laurent","sofia.laurent"," +377 6 91 24 57","Monaco"],
  ["Daniel","Bennett","daniel.bennett","+44 7700 912 481","United Kingdom"],
  ["Amara","Okafor","amara.okafor","+234 803 456 7821","Nigeria"],
  ["Elena","Rossi","elena.rossi","+39 347 221 9084","Italy"],
  ["Julien","Martin","julien.martin","+33 6 52 18 74 90","France"]
];
const demoDomains=["example.com","rocher-demo.test"];
const pick=a=>a[Math.floor(Math.random()*a.length)];
const randomDigits=n=>Array.from({length:n},()=>Math.floor(Math.random()*10)).join("");
function populateDemo(){
  const p=pick(demoProfiles);
  const form=document.querySelector("#createCustomer");
  form.elements.firstName.value=p[0];
  form.elements.lastName.value=p[1];
  form.elements.email.value=p[2]+"."+randomDigits(4)+"@"+pick(demoDomains);
  form.elements.password.value="Demo!"+randomDigits(8);
  form.elements.phone.value=p[3].trim();
  form.elements.country.value=p[4];
  form.elements.accountType.value=pick(["CURRENT","SAVINGS","PRIVATE"]);
  form.elements.currency.value=pick(["EUR","EUR","USD","GBP"]);
  document.querySelector("#generateHistory").checked=true;
  document.querySelector("#createMessage").textContent="Demo customer populated. Review the details, then create the customer.";
}
async function ensureAdmin(){const r=await fetch("/api/admin/overview");if(r.status===401){location.href="/admin/login.html";return false}return r.ok}
document.querySelector("#populateDemo").addEventListener("click",populateDemo);
document.querySelector("#createCustomer").addEventListener("submit",async e=>{
  e.preventDefault();
  const m=document.querySelector("#createMessage");
  m.textContent="Creating customer…";
  const body=Object.fromEntries(new FormData(e.currentTarget));
  body.generateHistory=document.querySelector("#generateHistory").checked;
  const r=await fetch("/api/admin/customers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json();
  m.textContent=r.ok
    ?"Customer created. Account: "+j.accountNumber+(j.historyGenerated?" · Demo history generated.":"")
    :j.error||"Unable to create customer.";
  if(r.ok)e.currentTarget.reset();
});
document.querySelector("#logout").onclick=async()=>{await fetch("/api/auth/logout",{method:"POST"});location.href="/admin/login.html"};
ensureAdmin();