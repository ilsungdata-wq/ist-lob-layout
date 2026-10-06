(function(global){
 const VIEW=['layout.view','lob.view','equipment.view'];
 const EDIT=[...VIEW,'layout.edit','lob.edit','equipment.edit','jig.edit','tt.measure','excel.import'];
 const MANAGE=[...EDIT,'model.manage','version.create','version.manage','version.publish'];
 const ADMIN=[...MANAGE,'model.create','permission.manage'];
 const maps={VIEW:new Set(VIEW),EDIT:new Set(EDIT),MANAGE:new Set(MANAGE),ADMIN:new Set(ADMIN)};
 let context={globalRole:null,modelPermission:null,authenticated:false};
 function level(){if(context.globalRole==='ADMIN')return'ADMIN';return['MANAGE','EDIT','VIEW'].includes(context.modelPermission)?context.modelPermission:null}
 global.ISTCapabilities={
  configure(next={}){context={...context,...next}},
  can(capability){const current=level();return !!current&&maps[current].has(capability)},
  level,
  context:()=>({...context}),
  mappings:{VIEW:[...VIEW],EDIT:[...EDIT],MANAGE:[...MANAGE],ADMIN:[...ADMIN]}
 };
})(globalThis);
