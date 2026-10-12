const ink = '#39778E', water = '#7DCEDA', light = '#D3F3ED';
function lobe(c,x,y,rx,ry,phase,fill,alpha=1) {
  c.save();c.translate(x,y);c.globalAlpha=alpha;c.beginPath();
  for(let k=0;k<=24;k++){const a=k*Math.PI/12,r=1+.13*Math.sin(a*3+phase)+.06*Math.cos(a*5-phase);c.lineTo(Math.cos(a)*rx*r,Math.sin(a)*ry*r);}
  c.closePath();c.fillStyle=fill;c.strokeStyle=ink;c.lineWidth=1.4;c.fill();c.stroke();c.restore();
}
export function drawVariant(c,z,active,t,index) {
  if(index>=4){drawCombined(c,z,active,t,index-4);return;}
  const bottom=z.y+z.height,cx=z.x+z.width/2;
  if(!active){
    for(let i=0;i<3;i++)lobe(c,cx+(i-1)*14,bottom-6-Math.abs(Math.sin(t*1.5+i*2))*8,3+i%2,4,t+i,light,.45);
    return;
  }
  c.save();
  if(index===1){
    // Wide irregular water tongues, with quiet translucent interiors.
    for(let j=0;j<5;j++){
      const x=z.x+35+j*(z.width-70)/4,w=18+(j%2)*8;
      c.beginPath();c.moveTo(x-w,bottom);
      for(let y=bottom;y>=z.y;y-=22)c.lineTo(x-w+Math.sin(y*.04+t*4+j)*9,y);
      for(let y=z.y;y<=bottom;y+=22)c.lineTo(x+w+Math.sin(y*.033+t*3+j)*11,y);
      c.closePath();c.fillStyle='rgba(125,206,218,.16)';c.fill();
    }
    for(let i=0;i<26;i++){
      const f=((t*115+i*37)%z.height)/z.height,y=bottom-f*z.height;
      const x=z.x+25+(i*73%(z.width-50))+Math.sin(t*2+i)*10;
      lobe(c,x,y,7+(i%3)*3,10+(i%4)*3,i+t, i%3?water:light,.55*(1-f*.45));
      c.beginPath();c.moveTo(x-3,y-5);c.quadraticCurveTo(x,y-9,x+4,y-6);c.strokeStyle=light;c.lineWidth=1.8;c.stroke();
    }
  }else if(index===2){
    for(let i=0;i<23;i++){
      const f=((t*100+i*43)%z.height)/z.height,y=bottom-f*z.height;
      const x=cx+Math.sin(i*2.3)*z.width*.4+Math.sin(t*2+i)*9,r=6+i%4*3;
      lobe(c,x,y,r,r*1.17,i+t,water,.48);
      c.beginPath();c.ellipse(x-r*.18,y-r*.18,r*.52,r*.6,-.5,Math.PI,Math.PI*1.75);c.strokeStyle=light;c.lineWidth=2;c.stroke();
      if(i%3===0){c.beginPath();c.moveTo(x,y+r+5);c.lineTo(x-2,y+r+14);c.strokeStyle='rgba(125,206,218,.35)';c.lineWidth=2;c.stroke();}
    }
  }else{
    for(let j=0;j<4;j++){
      const x=z.x+45+j*(z.width-90)/3;
      c.beginPath();c.moveTo(x-22,bottom);c.lineTo(x-10,z.y+75);
      c.lineTo(x-20,z.y+100);c.lineTo(x-7,z.y+20+Math.sin(t*3+j)*15);
      c.lineTo(x,z.y+65);c.lineTo(x+11,z.y+35);c.lineTo(x+9,z.y+100);c.lineTo(x+23,bottom);
      c.closePath();c.fillStyle='rgba(125,206,218,.28)';c.strokeStyle='rgba(57,119,142,.5)';c.lineWidth=1.5;c.fill();c.stroke();
      for(let k=0;k<5;k++){
        const y=bottom-((t*160+k*127+j*29)%z.height),dx=Math.sin(k+j)*17;
        c.beginPath();c.moveTo(x+dx-4,y+13);c.lineTo(x+dx-1,y-9);c.lineTo(x+dx+5,y+7);c.closePath();c.fillStyle=light;c.globalAlpha=.65;c.fill();c.globalAlpha=1;
      }
    }
  }
  c.restore();
}

function drawCombined(c,z,active,t,variant){
  const bottom=z.y+z.height,cx=z.x+z.width/2;
  if(!active){drawVariant(c,z,false,t,2);return;}
  // First option preserves the original tongues and surge bubbles exactly.
  const configs=[
    {count:5,width:1,wiggle:1,speed:100,bubbles:23,radius:1,alpha:.16},
    {count:4,width:1.55,wiggle:1.5,speed:90,bubbles:18,radius:1.3,alpha:.18},
    {count:7,width:.55,wiggle:.65,speed:155,bubbles:30,radius:.7,alpha:.15},
    {count:5,width:.9,wiggle:2,speed:110,bubbles:23,radius:1,alpha:.17},
  ];
  const cfg=configs[variant>=8?2:variant>=4?1:variant];
  const shading=variant>=8?variant-4:variant;
  c.save();
  for(let j=0;j<cfg.count;j++){
    const x=z.x+35+j*(z.width-70)/(cfg.count-1),w=(18+(j%2)*8)*cfg.width;
    c.beginPath();c.moveTo(x-w,bottom);
    for(let y=bottom;y>=z.y;y-=22){
      const bend=variant===3?Math.sin(y*.015-t*2+j)*13:0;
      c.lineTo(x-w+Math.sin(y*.04+t*4+j)*9*cfg.wiggle+bend,y);
    }
    for(let y=z.y;y<=bottom;y+=22){
      const bend=variant===3?Math.sin(y*.015-t*2+j)*13:0;
      c.lineTo(x+w+Math.sin(y*.033+t*3+j)*11*cfg.wiggle+bend,y);
    }
    c.closePath();
    if(variant>=4){
      // Retain the broad silhouette while varying its interior construction.
      c.save();c.clip();
      if(shading===4){
        const shade=c.createLinearGradient(x-w,0,x+w,0);
        shade.addColorStop(0,'rgba(27,101,139,.24)');
        shade.addColorStop(.35,'rgba(98,195,212,.22)');
        shade.addColorStop(.62,'rgba(195,240,233,.28)');
        shade.addColorStop(1,'rgba(39,117,151,.18)');
        c.fillStyle=shade;c.fillRect(x-w-25,z.y,w*2+50,z.height);
      }else if(shading===5){
        c.fillStyle='rgba(78,170,191,.14)';c.fillRect(x-w-25,z.y,w*2+50,z.height);
        for(let k=0;k<8;k++){
          const y=bottom-((t*cfg.speed+k*92+j*27)%(z.height+100));
          c.beginPath();c.moveTo(x-w-15,y+40);
          c.bezierCurveTo(x-w*.4,y-45,x+w*.5,y+55,x+w+20,y-35);
          c.lineTo(x+w+20,y+25);
          c.bezierCurveTo(x+w*.3,y+100,x-w*.4,y+5,x-w-15,y+105);
          c.closePath();c.fillStyle=k%2?'rgba(38,108,145,.2)':'rgba(175,231,227,.25)';c.fill();
        }
      }else if(shading===6){
        for(let k=0;k<9;k++){
          const y=bottom-((t*cfg.speed+k*83+j*31)%(z.height+100));
          c.beginPath();c.moveTo(x-w-10,y+15);
          c.bezierCurveTo(x-w*.7,y-35,x+w*.2,y+25,x+w+10,y-20);
          c.lineTo(x+w+10,y+25);
          c.bezierCurveTo(x+w*.4,y+75,x-w*.3,y+20,x-w-10,y+68);
          c.closePath();c.fillStyle='rgba(118,207,215,.23)';c.fill();
          c.beginPath();c.moveTo(x-w-10,y+15);c.bezierCurveTo(x-w*.7,y-35,x+w*.2,y+25,x+w+10,y-20);
          c.strokeStyle='rgba(209,246,233,.32)';c.lineWidth=3;c.stroke();
        }
      }else{
        c.fillStyle='rgba(72,157,183,.12)';c.fillRect(x-w-25,z.y,w*2+50,z.height);
        for(let k=0;k<11;k++){
          const y=bottom-((t*cfg.speed+k*65+j*33)%(z.height+80));
          const dx=Math.sin(k*2+j)*w*.5;
          c.beginPath();c.moveTo(x+dx-10,y+32);
          c.bezierCurveTo(x+dx-19,y+9,x+dx+4,y-18,x+dx+9,y-33);
          c.bezierCurveTo(x+dx+21,y+7,x+dx+14,y+21,x+dx-10,y+32);
          c.closePath();c.fillStyle=k%3?'rgba(168,231,222,.25)':'rgba(35,103,143,.24)';c.fill();
        }
      }
      c.restore();
    }else{c.fillStyle=`rgba(125,206,218,${cfg.alpha})`;c.fill();}
  }
  for(let i=0;i<cfg.bubbles;i++){
    const f=((t*cfg.speed+i*43)%z.height)/z.height,y=bottom-f*z.height;
    const x=variant===3
      ? z.x+35+(i%5)*(z.width-70)/4+Math.sin(y*.015-t*2+i%5)*19
      : cx+Math.sin(i*2.3)*z.width*.4+Math.sin(t*2+i)*9;
    const r=(6+i%4*3)*cfg.radius;
    lobe(c,x,y,r,r*1.17,i+t,water,.48);
    c.beginPath();c.ellipse(x-r*.18,y-r*.18,r*.52,r*.6,-.5,Math.PI,Math.PI*1.75);c.strokeStyle=light;c.lineWidth=2;c.stroke();
    if(i%3===0){c.beginPath();c.moveTo(x,y+r+5);c.lineTo(x-2,y+r+14);c.strokeStyle='rgba(125,206,218,.35)';c.lineWidth=2;c.stroke();}
  }
  c.restore();
}
