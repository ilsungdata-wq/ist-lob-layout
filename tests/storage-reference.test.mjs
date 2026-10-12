import test from 'node:test';
import assert from 'node:assert/strict';
import {storageApi} from '../services/supabase/storage.js';

globalThis.localStorage={getItem:()=>null};
globalThis.IST_LOB_CONFIG={supabase:{url:'https://test.supabase.co',anonKey:'test-key-longer-than-twenty-characters'}};

test('uploaded Excel references resolve against Supabase Storage rather than GitHub Pages',async()=>{
 for(const path of ['model/excel-reference/layout.png','model/excel-source/layout.xlsm']){
  let request;
  globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({signedURL:`/object/sign/factory-assets/${path}?token=a.b-c`})};
  const result=await storageApi.signedUrl(path,600);
  assert.equal(result.signedURL,`https://test.supabase.co/storage/v1/object/sign/factory-assets/${path}?token=a.b-c`);
  assert.equal(result.signedUrl,result.signedURL);
  assert.equal(request.url,`https://test.supabase.co/storage/v1/object/sign/factory-assets/${path}`);
  assert.deepEqual(JSON.parse(request.options.body),{expiresIn:600});
 }
});

test('absolute and storage-prefixed signed URLs are not double-prefixed',async()=>{
 const expected='https://test.supabase.co/storage/v1/object/sign/factory-assets/image.png?token=test';
 for(const value of [expected,expected.replace('https://test.supabase.co','')]){
  globalThis.fetch=async()=>Response.json({signedUrl:value});
  assert.equal((await storageApi.signedUrl('image.png')).signedURL,expected);
 }
});

test('missing URLs and denied references fail without returning a broken image URL',async()=>{
 globalThis.fetch=async()=>Response.json({});
 await assert.rejects(storageApi.signedUrl('image.png'),/Không nhận được/);
 globalThis.fetch=async()=>Response.json({message:'Access denied'},{status:403});
 await assert.rejects(storageApi.signedUrl('image.png'),/Access denied/);
});

test('browser-normalized XLSM MIME types upload with the backend-supported type',async()=>{
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json(url.includes('/rpc/')?[{id:'asset'}]:{Key:'path'})};
 const file=new File(['workbook'],'layout.xlsm',{type:'application/vnd.ms-excel.sheet.macroEnabled.12'});
 const result=await storageApi.upload('model',file,{path:'excel-source/layout.xlsm'});
 assert.equal(result.record.id,'asset');
 assert.equal(calls[0].options.headers['Content-Type'],'application/vnd.ms-excel.sheet.macroEnabled.12');
 assert.equal(JSON.parse(calls[1].options.body).p_mime_type,'application/vnd.ms-excel.sheet.macroEnabled.12');
});
