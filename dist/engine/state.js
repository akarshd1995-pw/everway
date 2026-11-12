
const state={map:'compass',traffic:'none',season:'summer',view:'medium',difficulty:'normal',odometer:0,steer:0,started:false,paused:false,distance:0,speed:0,target:65,offset:0,ride:'car',car:'meridian',paint:null,mode:'cruise',time:16.5,autoTime:true,weather:'auto',biome:'auto',cam:0,sound:false};
// Every journey starts somewhere new: a random road (seed), a random place on the route, random
// weather and a random time of day. ?seed=… picks a road; ?debug keeps tests repeatable.
const _q=new URLSearchParams(location.search),_fixed=_q.has('debug')&&!_q.has('random');
state.seed=+_q.get('seed')||(_fixed?1:2+Math.floor(Math.random()*60466170));
state.routeOffset=_fixed?0:Math.floor(Math.random()*11);
state.weatherOffset=_fixed?0:Math.floor(Math.random()*5);
if(!_fixed)state.time=Math.round((5.5+Math.random()*16)*20)/20;
// Values several modules change while the game runs.
const G={};

export {state,G};
