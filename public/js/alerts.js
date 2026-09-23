(()=>{
  "use strict";
  const base={confirmButtonText:"Continue",buttonsStyling:true,customClass:{confirmButton:"rm-swal-confirm",cancelButton:"rm-swal-cancel"}};
  const fire=(options={})=>window.Swal?.fire({...base,...options});
  const toast=window.Swal?window.Swal.mixin({toast:true,position:"top-end",showConfirmButton:false,timer:3200,timerProgressBar:true}):null;
  window.RMAlert={
    fire,
    success:(title,text="")=>fire({icon:"success",title,text}),
    error:(title,text="")=>fire({icon:"error",title,text}),
    info:(title,text="")=>fire({icon:"info",title,text}),
    warning:(title,text="")=>fire({icon:"warning",title,text}),
    confirm:(title,text="",confirm="Continue")=>fire({icon:"question",title,text,showCancelButton:true,confirmButtonText:confirm,cancelButtonText:"Cancel"}),
    toastSuccess:(title)=>toast?.fire({icon:"success",title}),
    toastError:(title)=>toast?.fire({icon:"error",title}),
    loading:(title="Working…")=>fire({title,allowOutsideClick:false,showConfirmButton:false,didOpen:()=>window.Swal.showLoading()})
  };
})();
