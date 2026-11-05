import * as T from '../three.module.js';
import {renderer} from './render.js';
// HDR post-processing: MSAA scene target, ambient occlusion, bloom, ACES tone mapping and grading.
/* ----------------------------------------------------------- post process */

const quadGeo=new T.BufferGeometry();

quadGeo.setAttribute('position',new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));

quadGeo.setAttribute('uv',new T.Float32BufferAttribute([0,0,2,0,0,2],2));

const quadCam=new T.OrthographicCamera(-1,1,1,-1,0,1);

const QUAD_VS='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';

const passMat=(fs,uniforms)=>new T.ShaderMaterial({uniforms,vertexShader:QUAD_VS,fragmentShader:fs,depthTest:false,depthWrite:false});

class Post{
  constructor(){
    this.quad=new T.Mesh(quadGeo);this.quad.frustumCulled=false;this.levels=[];
    this.down=passMat(`uniform sampler2D tMap;uniform vec2 texel;uniform float threshold;varying vec2 vUv;
      void main(){vec3 c=(texture2D(tMap,vUv+texel*vec2(-.5,-.5)).rgb+texture2D(tMap,vUv+texel*vec2(.5,-.5)).rgb+texture2D(tMap,vUv+texel*vec2(-.5,.5)).rgb+texture2D(tMap,vUv+texel*vec2(.5,.5)).rgb)*.25;
      float l=max(c.r,max(c.g,c.b));c*=max(l-threshold,0.)/max(l,1e-4);gl_FragColor=vec4(min(c,vec3(30.)),1.);}`,{tMap:{value:null},texel:{value:new T.Vector2()},threshold:{value:1}});
    this.blur=passMat(`uniform sampler2D tMap;uniform vec2 dir;varying vec2 vUv;
      void main(){vec3 c=texture2D(tMap,vUv).rgb*.227027;c+=(texture2D(tMap,vUv+dir*1.384615).rgb+texture2D(tMap,vUv-dir*1.384615).rgb)*.316216;c+=(texture2D(tMap,vUv+dir*3.230769).rgb+texture2D(tMap,vUv-dir*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`,{tMap:{value:null},dir:{value:new T.Vector2()}});
    this.ao=passMat(`uniform sampler2D tDepth;uniform mat4 uProj,uInvProj;uniform float uRadius;varying vec2 vUv;
      vec3 vpos(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=uInvProj*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
      void main(){float d=texture2D(tDepth,vUv).x;if(d>.99995){gl_FragColor=vec4(1.);return;}
        vec3 P=vpos(vUv),N=normalize(cross(dFdx(P),dFdy(P)));if(dot(N,P)>0.)N=-N;
        vec3 Tg=normalize(cross(N,abs(N.z)<.9?vec3(0.,0.,1.):vec3(0.,1.,0.))),Bt=cross(N,Tg);
        float ang=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)*6.2831,rad=uRadius*(1.+(-P.z)*.009),occ=0.;
        for(int i=0;i<12;i++){float fi=float(i)+1.,a=ang+fi*2.39996,rr=rad*sqrt(fi/12.);vec3 S=P+(Tg*cos(a)+Bt*sin(a))*rr+N*rr*.35;
          vec4 cp=uProj*vec4(S,1.);vec2 suv=cp.xy/cp.w*.5+.5;if(any(lessThan(suv,vec2(0.)))||any(greaterThan(suv,vec2(1.))))continue;
          vec3 v=vpos(suv)-P;float l=length(v);occ+=max(dot(N,v)/max(l,1e-3)-.12,0.)*(1.-smoothstep(rad*.7,rad*2.2,l));}
        occ*=1.-smoothstep(150.,360.,-P.z); // depth gets too coarse to judge far away
        gl_FragColor=vec4(vec3(clamp(1.-occ/12.*2.4,0.,1.)),1.);}`,{tDepth:{value:null},uProj:{value:new T.Matrix4()},uInvProj:{value:new T.Matrix4()},uRadius:{value:1.1}});
    this.aoBlur=passMat(`uniform sampler2D tAO,tDepth;uniform vec2 dir;uniform float uNear,uFar;varying vec2 vUv;
      float lin(float d){return uNear*uFar/(uFar-d*(uFar-uNear));}
      void main(){float d0=lin(texture2D(tDepth,vUv).x),s=0.,w=0.;for(int i=-3;i<=3;i++){vec2 uv=vUv+dir*float(i);float di=lin(texture2D(tDepth,uv).x);
        float wt=exp(-float(i*i)/6.)/(1.+abs(di-d0)/(d0*.03+.05)*3.);s+=texture2D(tAO,uv).r*wt;w+=wt;}gl_FragColor=vec4(vec3(s/w),1.);}`,{tAO:{value:null},tDepth:{value:null},dir:{value:new T.Vector2()},uNear:{value:.1},uFar:{value:3200}});
    this.comp=passMat(`uniform sampler2D tScene,tB0,tB1,tB2,tB3,tAO;uniform float bloom,exposure,saturation,vignette,aoAmt,rays;uniform vec2 sunUv,aspect;uniform vec3 gain,lift,rayCol;varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){vec3 a=v*(v+.0245786)-.000090537;vec3 b=v*(.983729*v+.4329510)+.238081;return a/b;}
      vec3 aces(vec3 c){const mat3 I=mat3(vec3(.59719,.07600,.02840),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));const mat3 O=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));c*=exposure/.6;c=I*c;c=RRTAndODTFit(c);c=O*c;return clamp(c,0.,1.);}
      vec3 srgb(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
      void main(){vec3 c=texture2D(tScene,vUv).rgb*mix(1.,texture2D(tAO,vUv).r,aoAmt);
        vec3 b=texture2D(tB0,vUv).rgb*.55+texture2D(tB1,vUv).rgb*.75+texture2D(tB2,vUv).rgb*.95+texture2D(tB3,vUv).rgb*1.1;
        // light shafts: the bright sky round the sun streaks towards the viewer past clouds, hills and trees
        if(rays>0.){vec2 dl=(vUv-sunUv)/30.;vec2 p=vUv;float w=1.,acc=0.,fall=1.-smoothstep(.0,.9,length((vUv-sunUv)*aspect));
          for(int i=0;i<30;i++){p-=dl;vec3 s=texture2D(tB1,p).rgb+texture2D(tB2,p).rgb;acc+=dot(s,vec3(.33))*w;w*=.955;}
          c+=rayCol*min(acc/30.,2.)*rays*fall;}
        c=(c+b*bloom)*gain;c=aces(c);float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,saturation);c+=lift*(1.-c);
        vec2 q=vUv-.5;c*=1.-dot(q,q)*vignette;c=srgb(c);
        c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;gl_FragColor=vec4(c,1.);}`,
      {tScene:{value:null},tAO:{value:null},aoAmt:{value:0},tB0:{value:null},tB1:{value:null},tB2:{value:null},tB3:{value:null},bloom:{value:.5},exposure:{value:1},saturation:{value:1.06},vignette:{value:.28},rays:{value:0},sunUv:{value:new T.Vector2(.5,.8)},aspect:{value:new T.Vector2(1,1)},rayCol:{value:new T.Vector3(1,.9,.75)},gain:{value:new T.Vector3(1,1,1)},lift:{value:new T.Vector3()}});
  }
  setSize(w,h,samples){
    this.dispose();this.w=w;this.h=h;
    this.main=new T.WebGLRenderTarget(w,h,{type:T.HalfFloatType,samples});this.main.depthTexture=new T.DepthTexture(w,h);
    const aw=Math.max(1,w>>1),ah=Math.max(1,h>>1);this.aoA=new T.WebGLRenderTarget(aw,ah,{depthBuffer:false});this.aoB=new T.WebGLRenderTarget(aw,ah,{depthBuffer:false});this.aoSize=[aw,ah];
    for(let l=0;l<4;l++){const lw=Math.max(1,w>>(l+1)),lh=Math.max(1,h>>(l+1)),o={type:T.HalfFloatType,depthBuffer:false};this.levels.push({a:new T.WebGLRenderTarget(lw,lh,o),b:new T.WebGLRenderTarget(lw,lh,o),w:lw,h:lh});}
    const u=this.comp.uniforms;u.tScene.value=this.main.texture;u.tAO.value=this.aoA.texture;['tB0','tB1','tB2','tB3'].forEach((k,i)=>u[k].value=this.levels[i].a.texture);
  }
  dispose(){this.main?.depthTexture?.dispose();this.main?.dispose();this.aoA?.dispose();this.aoB?.dispose();for(const l of this.levels){l.a.dispose();l.b.dispose();}this.levels=[];}
  draw(mat,target){this.quad.material=mat;renderer.setRenderTarget(target);renderer.render(this.quad,quadCam);}
  render(scene,camera,bloom,threshold,ao=0){
    renderer.setRenderTarget(this.main);renderer.render(scene,camera);
    if(ao>0){const a=this.ao.uniforms,b=this.aoBlur.uniforms,[aw,ah]=this.aoSize;a.tDepth.value=this.main.depthTexture;a.uProj.value.copy(camera.projectionMatrix);a.uInvProj.value.copy(camera.projectionMatrixInverse);this.draw(this.ao,this.aoA);
      b.tDepth.value=this.main.depthTexture;b.uNear.value=camera.near;b.uFar.value=camera.far;b.tAO.value=this.aoA.texture;b.dir.value.set(1.5/aw,0);this.draw(this.aoBlur,this.aoB);b.tAO.value=this.aoB.texture;b.dir.value.set(0,1.5/ah);this.draw(this.aoBlur,this.aoA);}
    this.comp.uniforms.aoAmt.value=ao;this.comp.uniforms.aspect.value.set(this.w/this.h,1);if(bloom<=0)this.comp.uniforms.rays.value=0;
    if(bloom>0){let src=this.main.texture,sw=this.w,sh=this.h;
      for(let l=0;l<this.levels.length;l++){const L=this.levels[l],d=this.down.uniforms,b=this.blur.uniforms;
        d.tMap.value=src;d.texel.value.set(1/sw,1/sh);d.threshold.value=l===0?threshold:0;this.draw(this.down,L.a);
        b.tMap.value=L.a.texture;b.dir.value.set(1/L.w,0);this.draw(this.blur,L.b);
        b.tMap.value=L.b.texture;b.dir.value.set(0,1/L.h);this.draw(this.blur,L.a);
        src=L.a.texture;sw=L.w;sh=L.h;}}
    this.comp.uniforms.bloom.value=bloom;this.draw(this.comp,null);
  }
}

const post=new Post();

export {quadGeo,quadCam,QUAD_VS,passMat,Post,post};
