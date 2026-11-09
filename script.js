'use strict';
const produk = [
  ['L01','Matcha Signature','Latte',15000], ['L02','Strawberry Matcha Latte','Latte',20000],
  ['L03','Taro Matcha Latte','Latte',20000], ['L04','Chocolate Matcha Latte','Latte',20000],
  ['L05','Choco Malt Matcha Latte','Latte',20000], ['L06','Brown Sugar Matcha Latte','Latte',20000],
  ['L07','Caramel Matcha Cream Cheese','Latte',null],
  ['C01','Matcha Signature Cloud','Cloud',25000], ['C02','Taro Matcha Cloud','Cloud',25000],
  ['C03','Chocolate Matcha Cloud','Cloud',25000], ['C04','Choco Malt Matcha Cloud','Cloud',25000],
  ['C05','Matcha Cream Cheese','Cloud',null],
  ['U01','Signature Ube Matcha Cloud','Ube',null], ['U02','Signature Ube Cloud','Ube',null],
  ['U03','Ube Latte','Ube',null],
].map(([kode,nama,seri,harga])=>({kode,nama,seri,harga}));
const $ = id => document.getElementById(id);
const uang = n => 'Rp' + n.toLocaleString('id-ID');
const hariWib = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const namaHari = d => new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
const aman = x => String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const positif = n => Number.isSafeInteger(n) && n>0 && n<=999999999;
const tanggalValid = s => {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||s>hariWib()) return false;
  const d=new Date(s+'T00:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0,10)===s;
};
const cart = new Map();
let kategori='Latte', pembayaran='', db, records=[], sibuk=false, timer;
const namaDatabase = 'dmatcha-kasir-reset-01';
const sync = typeof BroadcastChannel==='function' ? new BroadcastChannel(namaDatabase) : null;
const svgCup = color => '<svg viewBox="0 0 32 40" aria-hidden="true"><path d="M4 11h24l-4 25H8z" fill="#fff9e7" stroke="#476047"/><path d="M6 18h20l-3 16H9z" fill="'+color+'"/><ellipse cx="16" cy="11" rx="12" ry="4" fill="#9bb374" stroke="#476047"/><path d="m12 10 3 1m4-2 3 1" stroke="#edf2d7" stroke-width="2" stroke-linecap="round"/></svg>';
function kabar(text){clearTimeout(timer);$('status').textContent=text;timer=setTimeout(()=>$('status').textContent='',4500);}
function bukaDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(namaDatabase,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('transaksi',{keyPath:'id'});
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Tutup tab kasir lain lalu muat ulang.'));
    request.onsuccess=()=>resolve(request.result);
  });
}
function storage(mode, action){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('transaksi',mode);
    let result;
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(tx.error || new Error('Penyimpanan dibatalkan.'));
    action(tx.objectStore('transaksi'), value=>{result=value;});
  });
}
async function refresh(){
  records=await storage('readonly',(store,done)=>{const r=store.getAll();r.onsuccess=()=>done(r.result);});
  renderRiwayat();renderRekap();
}
async function simpan(action, message){
  if(!db||sibuk)return false;
  sibuk=true;aktifkan();
  try{
    await storage('readwrite',action);
    sync?.postMessage('changed');
    try{await refresh();kabar(message);}catch{ kabar(message+' Muat ulang untuk melihat riwayat.'); }
    return true;
  }catch{ kabar('Perubahan gagal disimpan. Coba lagi.');return false; }
  finally{sibuk=false;aktifkan();}
}
function keranjang(){
  return produk.filter(p=>cart.has(p.kode)).map(p=>({kode:p.kode,nama:p.nama,harga:p.harga,jumlah:cart.get(p.kode)}));
}
function tampilMenu(fokus){
  $('seri').innerHTML=['Semua','Latte','Cloud','Ube'].map(s=>'<button type="button" data-seri="'+s+'" aria-pressed="'+(kategori===s)+'">'+s+'</button>').join('');
  const kata=$('cariMenu').value.toLocaleLowerCase('id-ID').trim().split(/\s+/).filter(Boolean);
  const hasil=produk.filter(p=>(kategori==='Semua'||p.seri===kategori)&&
    kata.every(k=>(p.nama+' '+p.seri).toLocaleLowerCase('id-ID').includes(k)));
  $('hapusCari').hidden=!$('cariMenu').value;
  $('hasilMenu').textContent=hasil.length+' varian'+(kategori==='Semua'?'':' · '+kategori);
  $('menu').innerHTML=hasil.map(p=>{
    const n=cart.get(p.kode)||0;
    const control=p.harga ? '<div class="qty">'+(n?'<button type="button" data-item="'+p.kode+'" data-delta="-1" aria-label="Kurangi '+p.nama+'">−</button><span>'+n+'</span>':'')+
      '<button type="button" data-item="'+p.kode+'" data-delta="1" aria-label="Tambah '+p.nama+'">+</button></div>' : '';
    return '<div class="product'+(n?' selected':'')+'"><div class="cup">'+svgCup(p.kode==='L02'?'#d8a197':p.nama.includes('Taro')?'#b9a3c9':'#b8cc87')+'</div><div><strong>'+p.nama+'</strong><span class="muted">'+(p.harga?uang(p.harga):'Harga belum diisi')+'</span></div>'+control+'</div>';
  }).join('')||'<p class="panel muted empty">Menu tidak ditemukan. Coba kata lain atau pilih Semua.</p>';
  if(fokus?.kode){
    const selector='[data-item="'+fokus.kode+'"]';
    ($('menu').querySelector(selector+'[data-delta="'+fokus.delta+'"]')||$('menu').querySelector(selector))?.focus({preventScroll:true});
  }else if(fokus?.seri){$('seri').querySelector('[data-seri="'+fokus.seri+'"]')?.focus({preventScroll:true});}
  const items=keranjang();
  $('gelas').textContent=items.reduce((n,p)=>n+p.jumlah,0)+' gelas';
  $('total').textContent=uang(items.reduce((n,p)=>n+p.jumlah*p.harga,0));
  $('keranjang').innerHTML=items.map(p=>'<div class="split"><span>'+aman(p.jumlah+' × '+p.nama)+'</span><span class="amount">'+uang(p.jumlah*p.harga)+'</span></div>').join('')||'Pilih minuman dari menu.';
  document.querySelectorAll('[data-payment]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.payment===pembayaran));
  aktifkan();
}
function aktifkan(){
  $('simpanJual').disabled=!db||sibuk||!cart.size||!pembayaran;
  for(const id of ['simpanKeluar','cadangkan','pulihkan'])$(id).disabled=!db||sibuk;
}
function baris(label,value){
  return '<div class="split list-row"><span>'+aman(label)+'</span><span class="amount">'+aman(value)+'</span></div>';
}
function renderRiwayat(){
  const rows=records.filter(r=>r.tanggal===$('tanggalRiwayat').value).sort((a,b)=>b.dibuat-a.dibuat);
  $('daftarRiwayat').innerHTML=rows.map(r=>{
    const judul=r.jenis==='jual'?'Penjualan · '+r.metode:'Pengeluaran · '+r.metode;
    const detail=r.jenis==='jual'?r.items.map(i=>i.jumlah+' × '+i.nama).join(' · '):r.keterangan;
    const status=r.batal?'<span class="badge cancelled">Batal</span>':'<button type="button" class="danger" data-batal="'+aman(r.id)+'">Batalkan</button>';
    return '<article class="panel stack"><div class="split"><strong>'+aman(judul)+'</strong><strong>'+uang(r.total)+'</strong></div><p>'+aman(detail)+'</p><div class="split"><span class="muted">'+aman(new Date(r.dibuat).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}))+' WIB · dicatat</span>'+status+'</div></article>';
  }).join('')||'<p class="panel muted">Belum ada transaksi pada tanggal ini.</p>';
}
let strukAktif=null, versiStruk=0;

function gambarStruk(rekap){
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const lebar=580, kiri=36, kanan=lebar-kiri;
  const gambar=[];
  let y=34;
  const h=(teks,font,warna,x,pos,align='left')=>gambar.push(()=>{
    ctx.font=font;ctx.fillStyle=warna;ctx.textAlign=align;
    ctx.fillText(teks,x,pos);
  });
  const tinta='#182d22', redup='#4e6557', pucat='#dbe8c2';
  function garis(){
    y+=12;
    const posisi=y;
    gambar.push(()=>{
      ctx.beginPath();ctx.setLineDash([5,5]);ctx.strokeStyle='#aebda4';
      ctx.moveTo(kiri,posisi);ctx.lineTo(kanan,posisi);ctx.stroke();ctx.setLineDash([]);
    });
    y+=25;
  }
  function bungkus(teks,lebarMaks,font){
    ctx.font=font;
    const hasil=[];
    let baris='';
    for(const kata of teks.split(/\s+/)){
      const calon=baris?baris+' '+kata:kata;
      if(ctx.measureText(calon).width<=lebarMaks){baris=calon;continue;}
      if(baris)hasil.push(baris);
      baris='';
      for(const huruf of kata){
        if(baris&&ctx.measureText(baris+huruf).width>lebarMaks){hasil.push(baris);baris='';}
        baris+=huruf;
      }
    }
    return [...hasil,baris];
  }
  function baris(label,nilai){
    const font='19px system-ui,sans-serif', tebal='700 19px system-ui,sans-serif';
    ctx.font=tebal;
    const ruang=Math.max(145,kanan-kiri-ctx.measureText(nilai).width-20);
    const labelBaris=bungkus(label,ruang,font);
    h(nilai,tebal,tinta,kanan,y,'right');
    for(const teks of labelBaris){h(teks,font,tinta,kiri,y);y+=25;}
    y+=5;
  }
  function bagian(judul,rincian,kosong){
    h(judul,'750 22px system-ui,sans-serif',tinta,kiri,y);y+=34;
    if(rincian.length)rincian.forEach(([label,nilai])=>baris(label,nilai));
    else{h(kosong,'17px system-ui,sans-serif',redup,kiri,y);y+=27;}
  }
  y+=15;
  h('D’Matcha Moment','700 34px Georgia,serif',tinta,lebar/2,y,'center');
  y+=28;
  h('REKAP PENJUALAN HARIAN','750 15px system-ui,sans-serif',redup,lebar/2,y,'center');
  y+=25;
  h(namaHari(rekap.tanggal),'19px system-ui,sans-serif',tinta,lebar/2,y,'center');
  y+=22;
  const kartuY=y;
  gambar.push(()=>{
    ctx.fillStyle='#173728';
    ctx.fillRect(kiri,kartuY,kanan-kiri,126);
  });
  h('TOTAL PEMASUKAN','750 15px system-ui,sans-serif',pucat,kiri+20,y+28);
  h(uang(rekap.masuk),'800 37px system-ui,sans-serif','#fffef9',kiri+20,y+72);
  h(rekap.gelas+' gelas terjual','19px system-ui,sans-serif','#fffef9',kiri+20,y+104);
  y+=159;
  baris('Cash',uang(rekap.sales.Cash));
  baris('QRIS',uang(rekap.sales.QRIS));
  garis();
  bagian('Penjualan per varian',rekap.detailJual,'Belum ada penjualan.');
  garis();
  bagian('Pengeluaran',rekap.detailKeluar,'Belum ada pengeluaran.');
  baris('Total pengeluaran',uang(rekap.keluar));
  garis();
  baris('Selisih pemasukan dan pengeluaran',uang(rekap.masuk-rekap.keluar));
  baris('Perubahan kas tunai',uang(rekap.sales.Cash-rekap.biaya.Cash));
  const tinggi=y+17, skala=Math.min(2,8192/tinggi);
  canvas.width=Math.round(lebar*skala);
  canvas.height=Math.round(tinggi*skala);
  ctx.scale(skala,skala);
  ctx.fillStyle='#fffef9';ctx.fillRect(0,0,lebar,tinggi);
  gambar.forEach(lukis=>lukis());
  return canvas;
}
function perbaruiStruk(rekap){
  const versi=++versiStruk;
  const unduh=$('unduhPng'), preview=$('pratinjauPng'), bagikan=$('bagikanPng');
  bagikan.disabled=true;
  unduh.removeAttribute('href');unduh.setAttribute('aria-disabled','true');
  preview.hidden=true;preview.removeAttribute('src');
  if(strukAktif)URL.revokeObjectURL(strukAktif.url);
  strukAktif=null;
  if(!db||!rekap)return;
  try{
    gambarStruk(rekap).toBlob(blob=>{
      if(versi!==versiStruk)return;
      if(!blob){kabar('Gambar rekap belum bisa dibuat. Coba pilih ulang tanggal.');return;}
      const nama='rekap-dmatcha-'+rekap.tanggal+'.png';
      const url=URL.createObjectURL(blob);
      strukAktif={blob,nama,url};
      unduh.href=url;unduh.download=nama;unduh.removeAttribute('aria-disabled');
      preview.src=url;preview.hidden=false;bagikan.disabled=false;
    },'image/png');
  }catch{kabar('Gambar rekap belum bisa dibuat di browser ini.');}
}
function renderRekap(){
  const tanggal=$('tanggalRekap').value;
  if(!tanggalValid(tanggal)){
    $('isiRekap').textContent='Pilih tanggal rekap.';
    perbaruiStruk(null);
    return;
  }
  const sales={Cash:0,QRIS:0};
  const biaya={Cash:0,'Non-tunai':0};
  const menu=new Map(), pengeluaran=new Map();
  let gelas=0;
  const transaksi=records.filter(r=>r.tanggal===tanggal&&!r.batal);
  for(const r of transaksi){
    if(r.jenis==='jual'){
      sales[r.metode]+=r.total;
      for(const i of r.items){
        gelas+=i.jumlah;
        const prev=menu.get(i.nama)||[0,0];
        menu.set(i.nama,[prev[0]+i.jumlah,prev[1]+i.jumlah*i.harga]);
      }
    }else{
      biaya[r.metode]+=r.total;
      const label=r.keterangan+' ('+r.metode+')';
      pengeluaran.set(label,(pengeluaran.get(label)||0)+r.total);
    }
  }
  const masuk=sales.Cash+sales.QRIS, keluar=biaya.Cash+biaya['Non-tunai'];
  const detailJual=[...menu].map(([k,[n,v]])=>[k,n+' gelas · '+uang(v)]);
  const detailKeluar=[...pengeluaran].map(([k,v])=>[k,uang(v)]);
  $('isiRekap').innerHTML='<div class="stack"><article class="panel hero hero-income"><div>Total pemasukan</div><strong>'+uang(masuk)+'</strong><div>'+gelas+' gelas terjual</div></article>'+
    '<div class="two"><article class="panel">Cash<br><strong>'+uang(sales.Cash)+'</strong></article><article class="panel">QRIS<br><strong>'+uang(sales.QRIS)+'</strong></article></div>'+
    '<article class="panel"><h2>Per varian</h2>'+(detailJual.map(([a,b])=>baris(a,b)).join('')||'<p class="muted">Belum ada penjualan.</p>')+'</article></div>'+
    '<div class="stack"><article class="panel"><h2>Pengeluaran</h2>'+(detailKeluar.map(([a,b])=>baris(a,b)).join('')||'<p class="muted">Belum ada pengeluaran.</p>')+
    baris('Total pengeluaran',uang(keluar))+'</article><article class="panel hero">'+baris('Selisih pemasukan dan pengeluaran',uang(masuk-keluar))+baris('Perubahan kas tunai',uang(sales.Cash-biaya.Cash))+'</article></div>';
  perbaruiStruk({tanggal,gelas,sales,biaya,masuk,keluar,detailJual,detailKeluar});
}
function kontrolTanggal(){
  document.querySelectorAll('[data-date-tools]').forEach(bar=>{
    const input=$(bar.dataset.dateTools);
    const next=bar.querySelector('[data-day="1"]');
    const perbarui=()=>{next.disabled=!tanggalValid(input.value)||input.value>=hariWib();};
    input.addEventListener('change',perbarui);
    window.addEventListener('focus',perbarui);
    bar.addEventListener('click',e=>{
      const aksi=e.target.closest('[data-day]')?.dataset.day;
      if(!aksi)return;
      const tanggal=tanggalValid(input.value)?input.value:hariWib();
      if(aksi==='today')input.value=hariWib();
      else{
        const d=new Date(tanggal+'T00:00:00Z');
        d.setUTCDate(d.getUTCDate()+Number(aksi));
        const tujuan=d.toISOString().slice(0,10);
        if(!tanggalValid(tujuan))return;
        input.value=tujuan;
      }
      input.dispatchEvent(new Event('change'));
    });
    perbarui();
  });
}
function navigasi(name){
  document.querySelectorAll('main > section').forEach(s=>s.hidden=s.id!==name);
  document.querySelectorAll('[data-page]').forEach(b=>b.dataset.page===name?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
  window.scrollTo(0,0);
}
function transaksiBaru(jenis,tanggal,metode,total,detail){
  const dibuat=Date.now();
  const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
  return {id,jenis,tanggal,metode,total,dibuat,batal:false,...detail};
}
function backupValid(r){
  if(!r||!/^[-a-f0-9]{32,36}$/i.test(r.id)||!tanggalValid(r.tanggal)||!positif(r.total)||
    !Number.isSafeInteger(r.dibuat)||r.dibuat<=0||r.dibuat>8640000000000000||typeof r.batal!=='boolean')return false;
  if(r.jenis==='keluar')return ['Cash','Non-tunai'].includes(r.metode)&&typeof r.keterangan==='string'&&r.keterangan.trim().length>0&&r.keterangan.length<=120;
  return r.jenis==='jual'&&['Cash','QRIS'].includes(r.metode)&&Array.isArray(r.items)&&r.items.length>0&&r.items.length<=100&&
    r.items.every(i=>i&&typeof i.nama==='string'&&i.nama.length>0&&i.nama.length<=120&&positif(i.harga)&&Number.isInteger(i.jumlah)&&i.jumlah>=1&&i.jumlah<=99)&&
    r.items.reduce((s,i)=>s+i.harga*i.jumlah,0)===r.total;
}
document.querySelector('nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)navigasi(b.dataset.page);});
$('cariMenu').addEventListener('input',()=>{if($('cariMenu').value.trim())kategori='Semua';tampilMenu();});
$('hapusCari').addEventListener('click',()=>{$('cariMenu').value='';tampilMenu();$('cariMenu').focus();});
$('seri').addEventListener('click',e=>{const b=e.target.closest('[data-seri]');if(b){kategori=b.dataset.seri;tampilMenu({seri:kategori});}});
$('menu').addEventListener('click',e=>{
  const b=e.target.closest('[data-item]');if(!b||sibuk)return;
  const kode=b.dataset.item, delta=Number(b.dataset.delta);
  const n=Math.min(99,(cart.get(kode)||0)+delta);
  if(n>0)cart.set(kode,n);else cart.delete(kode);
  tampilMenu({kode,delta});
});
$('jual').addEventListener('click',e=>{const b=e.target.closest('[data-payment]');if(b&&!sibuk){pembayaran=b.dataset.payment;tampilMenu();}});
$('jual').addEventListener('submit',async e=>{
  e.preventDefault();
  if(sibuk||!cart.size||!pembayaran)return;
  const t=$('tanggalJual').value;if(!tanggalValid(t)){kabar('Pilih tanggal penjualan yang valid.');return;}
  const items=keranjang(),total=items.reduce((s,i)=>s+i.harga*i.jumlah,0);
  const r=transaksiBaru('jual',t,pembayaran,total,{items});
  if(await simpan(store=>store.add(r),'Penjualan tersimpan.')){
    cart.clear();pembayaran='';$('tanggalJual').value=hariWib();tampilMenu();
  }
});
$('keluar').addEventListener('submit',async e=>{
  e.preventDefault();
  const t=$('tanggalKeluar').value, nominal=Number($('nominal').value), keterangan=$('keterangan').value.trim();
  if(!tanggalValid(t)||!positif(nominal)||!keterangan){kabar('Periksa nominal, keterangan, dan tanggal.');return;}
  const r=transaksiBaru('keluar',t,$('sumber').value,nominal,{keterangan});
  if(await simpan(store=>store.add(r),'Pengeluaran tersimpan.')){
    e.target.reset();$('tanggalKeluar').value=hariWib();
  }
});
$('daftarRiwayat').addEventListener('click',e=>{
  const b=e.target.closest('[data-batal]');if(!b||sibuk||!confirm('Batalkan pencatatan transaksi ini?'))return;
  simpan(store=>{
    const req=store.get(b.dataset.batal);
    req.onsuccess=()=>{if(req.result&&!req.result.batal)store.put({...req.result,batal:true});};
  },'Transaksi dibatalkan.');
});
$('tanggalRiwayat').addEventListener('change',renderRiwayat);
$('tanggalRekap').addEventListener('change',renderRekap);
$('bagikanPng').addEventListener('click',async ()=>{
  if(!strukAktif)return;
  const {blob,nama}=strukAktif;
  try{
    const file=new File([blob],nama,{type:'image/png'});
    const data={files:[file]};
    if(typeof navigator.share==='function'&&navigator.canShare?.(data)){
      await navigator.share(data);
      return;
    }
  }catch(error){
    if(error.name==='AbortError')return;
  }
  const link=document.createElement('a');
  const url=URL.createObjectURL(blob);
  link.href=url;link.download=nama;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  kabar('PNG diunduh. Lampirkan gambar ini di WhatsApp.');
});
$('cadangkan').addEventListener('click',async ()=>{
  try{
    await refresh();
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'dmatcha-kasir',versi:1,records},null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='cadangan-dmatcha-'+hariWib()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch{kabar('Cadangan gagal dibuat.');}
});
$('pulihkan').addEventListener('click',()=>$('fileCadangan').click());
$('fileCadangan').addEventListener('change',async e=>{
  const file=e.target.files[0];e.target.value='';
  if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(data.format!=='dmatcha-kasir'||data.versi!==1||!Array.isArray(data.records)||
      !data.records.every(backupValid)||new Set(data.records.map(r=>r.id)).size!==data.records.length)throw Error();
    if(!confirm('Gabungkan '+data.records.length+' transaksi dari cadangan?'))return;
    await simpan(store=>{
      for(const r of data.records){
        const req=store.get(r.id);
        req.onsuccess=()=>{
          if(!req.result)store.add(r);
          else if(r.batal&&!req.result.batal)store.put({...req.result,batal:true});
        };
      }
    },'Cadangan digabungkan.');
  }catch{kabar('File cadangan tidak valid.');}
});
for(const id of ['tanggalJual','tanggalKeluar','tanggalRiwayat','tanggalRekap']){
  $(id).value=hariWib();$(id).max=hariWib();
}
window.addEventListener('focus',()=>{
  for(const id of ['tanggalJual','tanggalKeluar','tanggalRiwayat','tanggalRekap']){
    const input=$(id), hari=hariWib();
    if(input.max!==hari&&input.value===input.max)input.value=hari;
    input.max=hari;
  }
  if(db)refresh().catch(()=>{});
});
kontrolTanggal();tampilMenu();renderRiwayat();renderRekap();
bukaDb().then(async value=>{
  db=value;
  await refresh();aktifkan();
  if(sync)sync.onmessage=()=>refresh().catch(()=>{});
}).catch(()=>kabar('Penyimpanan tidak bisa dibuka. Gunakan browser biasa dan izinkan data situs.'));
