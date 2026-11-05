import * as T from '../three.module.js';
import {fillGeometry,pooledGeometry} from './pool.js';
import {C,clamp,vhash} from './core.js';
/* ----------------------------------------------------- geometry templates */

const TPL={};

const tpl=(key,make)=>TPL[key]||(TPL[key]=(()=>{let g=make();if(g.index)g=g.toNonIndexed();g.computeBoundingBox();return g;})());

const boxT=()=>tpl('box',()=>new T.BoxGeometry(1,1,1));

const cylT=(top=1,seg=8)=>tpl('cyl'+top+'_'+seg,()=>new T.CylinderGeometry(top,1,1,seg));

const coneT=(seg=8)=>tpl('cone'+seg,()=>new T.ConeGeometry(1,1,seg));

const sphT=()=>tpl('sph',()=>new T.SphereGeometry(1,12,8));

const quadT=()=>tpl('quad',()=>new T.PlaneGeometry(1,1));

function jitterT(kind,detail,amt,seed){return tpl(kind+detail+'_'+seed,()=>{const g=new T.IcosahedronGeometry(1,detail),p=g.attributes.position,v=new T.Vector3();
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const k=1+(vhash(Math.round(v.x*1e3),Math.round(v.y*1e3),Math.round(v.z*1e3)+seed*17)-.5)*amt;p.setXYZ(i,v.x*k,v.y*k,v.z*k);}
  g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).normalize();const a=new T.Vector3().fromBufferAttribute(n,i).multiplyScalar(.5).addScaledVector(v,.5).normalize();n.setXYZ(i,a.x,a.y,a.z);}return g;});}

const blobT=(r,near)=>jitterT('blob',near?1:0,.38,Math.floor(r()*6));

const rockT=r=>jitterT('rock',0,.55,10+Math.floor(r()*5));

const gambrelT=()=>tpl('gambrel',()=>{const s=new T.Shape();s.moveTo(-.5,0);s.lineTo(.5,0);s.lineTo(.36,.56);s.lineTo(0,1);s.lineTo(-.36,.56);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);g.rotateY(Math.PI/2);return g;});

const prismT=()=>tpl('prism',()=>{const s=new T.Shape();s.moveTo(-.5,0);s.lineTo(.5,0);s.lineTo(0,1);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:1,bevelEnabled:false});g.translate(0,0,-.5);g.rotateY(Math.PI/2);return g;});
 // ridge along x, slopes face ±z

const _e=new T.Euler(),_q=new T.Quaternion(),_v=new T.Vector3(),_s=new T.Vector3();

// Mt writes into one shared matrix: only for values that are used at once and not kept.
const _mt=new T.Matrix4(),_nm=new T.Matrix3();
function Mt(x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){_e.set(rx,ry,rz,'YXZ');return _mt.compose(_v.set(x,y,z),_q.setFromEuler(_e),_s.set(sx,sy,sz));}
function M(x,y,z,sx=1,sy=1,sz=1,ry=0,rx=0,rz=0){_e.set(rx,ry,rz,'YXZ');return new T.Matrix4().compose(_v.set(x,y,z),_q.setFromEuler(_e),_s.set(sx,sy,sz));}
/* Merges many small parts into one vertex-coloured mesh. */

class Batch{
  constructor({sway=false,uv=false}={}){this.p=[];this.n=[];this.c=[];this.s=sway?[]:null;this.u=uv?[]:null;}
  add(t,m,color,o={}){
    const P=t.attributes.position.array,N=t.attributes.normal.array,U=t.attributes.uv?.array,e=m.elements,nm=_nm.getNormalMatrix(m).elements,c=color.isColor?color:C(color),end=o.end&&(o.end.isColor?o.end:C(o.end));
    const y0=t.boundingBox.min.y,y1=t.boundingBox.max.y;
    for(let i=0,j=0;i<P.length;i+=3,j+=2){const x=P[i],y=P[i+1],z=P[i+2];
      const wx=e[0]*x+e[4]*y+e[8]*z+e[12],wy=e[1]*x+e[5]*y+e[9]*z+e[13],wz=e[2]*x+e[6]*y+e[10]*z+e[14];
      let nx=nm[0]*N[i]+nm[3]*N[i+1]+nm[6]*N[i+2],ny=nm[1]*N[i]+nm[4]*N[i+1]+nm[7]*N[i+2],nz=nm[2]*N[i]+nm[5]*N[i+1]+nm[8]*N[i+2];const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
      this.p.push(wx,wy,wz);this.n.push(nx,ny,nz);
      let k=1;if(o.ao!==undefined)k*=o.ao+(1-o.ao)*clamp((y-y0)/((y1-y0)||1),0,1);if(o.top)k*=1+o.top*ny;if(o.vary)k*=1+(vhash(wx,wy,wz)-.5)*o.vary;
      const cc=end&&Math.abs(N[i])>.9?end:c;this.c.push(cc.r*k,cc.g*k,cc.b*k);
      if(this.s)this.s.push(o.sway?o.sway*clamp((wy-o.swayBase)/o.swayH,0,1):0);
      if(this.u){const uu=U?U[j]:0,vv=U?U[j+1]:0;if(o.uv)this.u.push(o.uv[0]+uu*(o.uv[2]-o.uv[0]),o.uv[1]+vv*(o.uv[3]-o.uv[1]));else this.u.push(uu,vv);}}
  }
  mesh(material,{cast=false,receive=true}={}){
    if(!this.p.length)return null;const n=this.p.length/3,layout={position:3,normal:3,color:3},data={position:this.p,normal:this.n,color:this.c};
    if(this.s){layout.sway=1;data.sway=this.s;}if(this.u){layout.uv=2;data.uv=this.u;}
    const g=fillGeometry(pooledGeometry(layout,n),data,n);
    const m=new T.Mesh(g,material);m.castShadow=cast;m.receiveShadow=receive;return m;}
}

export {TPL,tpl,boxT,cylT,coneT,sphT,quadT,jitterT,blobT,rockT,gambrelT,prismT,_e,_q,_v,_s,M,Mt,Batch};
