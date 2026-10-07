(function(global){
 const VIEW=['layout.view','lob.view','equipment.view'];
 const EDIT=[...VIEW,'layout.edit','lob.edit','equipment.edit','jig.edit','tt.measure','excel.import','version.create','history.view'];
 const MANAGE=[...EDIT,'model.manage','model.delete','version.manage','version.delete','version.publish','history.restore'];
 const ADMIN=[...MANAGE,'model.create','permission.manage'];
 const maps={VIEW:new Set(VIEW),EDIT:new Set(EDIT),MANAGE:new Set(MANAGE),ADMIN:new Set(ADMIN)};
 let context={globalRole:null,modelPermission:null,capabilities:[],authenticated:false,profileActive:true};
 function level(){if(context.globalRole==='ADMIN')return'ADMIN';if(context.capabilities?.length)return context.capabilities.some(value=>value.endsWith('.edit')||value.endsWith('.manage')||value.endsWith('.create')||value.endsWith('.delete')||value.endsWith('.publish')||value==='tt.measure'||value==='excel.import'||value==='history.restore')?'CUSTOM EDIT':'CUSTOM VIEW';return['MANAGE','EDIT','VIEW'].includes(context.modelPermission)?context.modelPermission:null}
 global.ISTCapabilities={
  configure(next={}){context={...context,...next}},
  can(capability){if(!context.authenticated||context.profileActive===false)return false;if(context.globalRole==='ADMIN')return maps.ADMIN.has(capability);if(context.capabilities?.length)return context.capabilities.includes(capability);const current=level();return !!current&&maps[current].has(capability)},
  level,
  context:()=>({...context}),
  mappings:{VIEW:[...VIEW],EDIT:[...EDIT],MANAGE:[...MANAGE],ADMIN:[...ADMIN]}
 };
})(globalThis);
