// Frozen ordinary trail behavior: 30Hz cosmetic ticks, 30ms spawn interval,
// cap five, alpha decay 4/s, swap-remove expired entries; renderer body ovals.
export function currentTrail(elapsed,speed){
  const images=[];let acc=0;
  for(let tick=1;tick<=Math.floor(elapsed*30+1e-7);tick++){
    const t=tick/30;
    if(speed>200){acc+=1/30;while(acc>=.03){acc-=.03;if(images.length<5)images.push({time:t,alpha:1});}}
    for(let i=images.length-1;i>=0;i--){images[i].alpha-=4/30;if(images[i].alpha<=0){images[i]=images[images.length-1];images.pop();}}
  }
  return images;
}
