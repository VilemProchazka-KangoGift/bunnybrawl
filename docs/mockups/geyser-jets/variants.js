const ink = '#39778E', water = '#7DCEDA', light = '#D3F3ED';
function lobe(c,x,y,rx,ry,phase,fill,alpha=1) {
  c.save();c.translate(x,y);c.globalAlpha=alpha;c.beginPath();
  for(let k=0;k<=24;k++){const a=k*Math.PI/12,r=1+.13*Math.sin(a*3+phase)+.06*Math.cos(a*5-phase);c.lineTo(Math.cos(a)*rx*r,Math.sin(a)*ry*r);}
  c.closePath();c.fillStyle=fill;c.strokeStyle=ink;c.lineWidth=1.4;c.fill();c.stroke();c.restore();
}
export function drawVariant(c,z,active,t,index) {
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
