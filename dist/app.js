// Everway bootstrap: the full WebGL 2 world when the browser supports it,
// otherwise the original compatibility renderer.
function hasWebGL2(){try{return !!document.createElement('canvas').getContext('webgl2');}catch{return false;}}
const forced=new URLSearchParams(location.search).get('renderer');
if(forced!=='software'&&hasWebGL2()){
  import('./world.js').catch(err=>{console.error(err);const e=document.getElementById('error');e.hidden=false;e.textContent='The 3D world could not start: '+err.message;});
}else{
  document.body.dataset.renderer='software';
  import('./legacy.js');
}
