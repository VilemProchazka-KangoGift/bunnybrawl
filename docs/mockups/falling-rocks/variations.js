import {drawLavaRock} from './baseline-rock.js';

export function drawCombinedRock(c,rock,theme,variant,speed,time){
  if(variant>=4){drawCometVariation(c,rock,theme,variant-4,speed,time);return;}
  const s=rock.size,count=[6,4,5,6][variant],spacing=[.06,.065,.055,.075][variant];
  for(let j=count-1;j>=0;j--){
    const age=j*spacing,fade=1-j/count,r=s*([.85,.62,.72,.65][variant]-j*.055);
    const drift=Math.sin(j*2.7+variant)*(variant===3?s:s*.55);
    c.save();c.translate(rock.x+drift,rock.y-speed*age-s*.4);c.rotate(Math.sin(j+time)*.25);
    c.globalAlpha=(variant===1?.58:.55)*fade;
    c.beginPath();for(let k=0;k<16;k++){const a=k*Math.PI/8,rr=r*(1+.2*Math.sin(k*2.2+j));c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*(variant===0?.8:1));}c.closePath();
    c.fillStyle=['#C7AE94','#ACA19A','#C0A68F','#C9B39A'][variant];c.strokeStyle='#624B40';c.lineWidth=1;c.fill();c.stroke();c.restore();
  }
  c.save();c.translate(rock.x,rock.y);c.fillStyle=theme.lavaRockConfig?.glowColor||'#FF6600';c.globalAlpha=.3;
  c.beginPath();
  if(variant===0){for(let k=0;k<48;k++){const a=k*Math.PI/24,r=s*(1.75+.21*Math.sin(a*7)+.13*Math.sin(a*3+.8));c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
  else if(variant===1){c.moveTo(-s*1.5,s*.6);c.bezierCurveTo(-s*2,-s*.4,-s*1.1,-s*1.8,-s*.7,-s*2.8);c.quadraticCurveTo(-s*.3,-s*1.5,0,-s*3.4);c.quadraticCurveTo(s*.4,-s*2,s*.8,-s*2.7);c.bezierCurveTo(s*.8,-s*1.3,s*2,-s*.3,s*1.4,s*.8);c.quadraticCurveTo(0,s*1.9,-s*1.5,s*.6);c.fill();}
  else if(variant===2){for(let k=0;k<20;k++){const a=k*Math.PI/10-.2,r=s*(k%2?1.4:2+.22*Math.sin(k*1.7));c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}c.closePath();c.fill();}
  else{for(let k=0;k<7;k++){const a=k*Math.PI*2/7,r=s*(1.3+.12*Math.sin(k*2));c.beginPath();c.ellipse(Math.cos(a)*r,Math.sin(a)*r,s*.7,s*.45,a,0,Math.PI*2);c.fill();}}
  c.restore();
  const fill=c.fill;let first=true;c.fill=function(...args){if(first){first=false;return;}return fill.apply(this,args);};
  try{drawLavaRock(c,rock,theme);}finally{c.fill=fill;}
}
export function drawCometVariation(c,rock,theme,variant,speed,time){
  const s=rock.size,count=[6,5,5,3][variant],gap=[.07,.075,.06,.07][variant];
  for(let j=count-1;j>=0;j--){
    const u=j/(count-1),x=rock.x+(variant===1?Math.sin(u*2.5)*s*1.5:variant===2?(j%2?1:-1)*s*.65:Math.sin(j*2.7)*s*.35),y=rock.y-j*gap*speed-s*.5,r=s*([.58,.75,.58,.9][variant]-u*.3);
    c.save();c.translate(x,y);c.rotate(Math.sin(time+j)*.2);c.globalAlpha=.58*(1-u*.8);c.beginPath();
    for(let k=0;k<16;k++){const a=k*Math.PI/8,rr=r*(1+.2*Math.sin(k*2.1+j));c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*(variant===0?1.2:.9));}c.closePath();c.fillStyle=variant===3?'#BBB0A4':'#ACA19A';c.strokeStyle='#624B40';c.lineWidth=1;c.fill();c.stroke();c.restore();
  }
  c.save();c.translate(rock.x,rock.y);c.scale(s,s);c.globalAlpha=.3;c.fillStyle=theme.lavaRockConfig?.glowColor||'#FF6600';c.beginPath();
  if(variant===0){c.moveTo(-1.15,.65);c.bezierCurveTo(-1.6,-.5,-.6,-2.2,-.3,-4.6);c.quadraticCurveTo(.2,-3.5,.25,-2.5);c.quadraticCurveTo(.65,-3.1,.75,-3.5);c.bezierCurveTo(.6,-1.8,1.6,-.2,1.1,.75);c.quadraticCurveTo(0,1.65,-1.15,.65);}
  else if(variant===1){c.moveTo(-1.4,.7);c.bezierCurveTo(-1.8,-.6,-.5,-1.9,.4,-2.6);c.bezierCurveTo(1.4,-3.7,2.1,-3.5,2.25,-2.8);c.quadraticCurveTo(1.5,-3.2,1.15,-2.2);c.quadraticCurveTo(2,-1.3,1.5,-.3);c.quadraticCurveTo(1.7,1.6,-1.4,.7);}
  else if(variant===2){c.moveTo(-1.35,.7);c.bezierCurveTo(-2,-.5,-1.5,-2,-1.25,-3.65);c.quadraticCurveTo(-.75,-2.9,-.25,-1.9);c.quadraticCurveTo(.35,-3,.8,-3.9);c.quadraticCurveTo(.75,-2.1,1.3,-1.15);c.quadraticCurveTo(1.9,.9,.65,1.25);c.quadraticCurveTo(0,1.6,-1.35,.7);}
  else{c.moveTo(-1.7,.7);c.bezierCurveTo(-2.3,-.1,-1.4,-1.3,-.8,-2.2);c.quadraticCurveTo(-.3,-1.7,0,-2.7);c.quadraticCurveTo(.45,-1.5,1,-2.1);c.bezierCurveTo(1.3,-1.1,2.1,-.3,1.7,.8);c.quadraticCurveTo(0,1.9,-1.7,.7);}
  c.closePath();c.fill();c.restore();
  const fill=c.fill;let first=true;c.fill=function(...args){if(first){first=false;return;}return fill.apply(this,args);};try{drawLavaRock(c,rock,theme);}finally{c.fill=fill;}
}
