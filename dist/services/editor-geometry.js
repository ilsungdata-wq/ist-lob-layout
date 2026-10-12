/* Geometry is measured from the rendered object's original transform. This
   avoids treating a rotated bounding box, stroke or group-local point as x/y. */
(function(root){
 function geometryAfterTransform(base,initial,current,util){
  const delta=util.multiplyTransformMatrices(current,util.invertTransform(initial));
  const point=util.transformPoint({x:base.x,y:base.y},delta);
  const before=util.qrDecompose(initial),after=util.qrDecompose(current);
  return{x:point.x,y:point.y,width:base.width*Math.abs(after.scaleX/before.scaleX),height:base.height*Math.abs(after.scaleY/before.scaleY),rotation:(base.rotation||0)+after.angle-before.angle};
 }
 root.ISTEditorGeometry={geometryAfterTransform};
})(globalThis);
