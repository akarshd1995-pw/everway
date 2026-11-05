import sys,glob,os
from PIL import Image,ImageChops,ImageStat
a,b=sys.argv[1],sys.argv[2]
rows=[]
for f in sorted(glob.glob(f'shots/p0/{a}_*.jpg')):
    g=f.replace(f'/{a}_',f'/{b}_')
    if not os.path.exists(g): continue
    A=Image.open(f).convert('RGB');B=Image.open(g).convert('RGB')
    d=ImageChops.difference(A,B);m=sum(ImageStat.Stat(d).mean)/3
    big=sum(1 for p in d.convert('L').getdata() if p>40)/(A.width*A.height)*100
    rows.append((os.path.basename(f)[len(a)+1:-4],m,big))
for n,m,big in rows: print(f'{n:18s} mean diff {m:5.2f}   pixels >40: {big:5.2f}%')
