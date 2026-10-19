const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const A = '/tmp/claude-0/-home-user-macrovision-ai/96e345c4-bc83-5603-a34d-2f7c9a397a39/scratchpad/assets';
const OUT = '/tmp/claude-0/-home-user-macrovision-ai/96e345c4-bc83-5603-a34d-2f7c9a397a39/scratchpad/out';
const b64 = f => 'data:image/png;base64,' + fs.readFileSync(path.join(A, f)).toString('base64');
const LOGO = b64('logo.png'), TOOTH = b64('tooth_up.png'), IMPLANT = b64('implant_up.png');

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
.page{width:1080px;height:1350px;position:relative;overflow:hidden;font-family:'Nunito',sans-serif;color:#17306b;
 background:radial-gradient(circle at 20% 15%,#ffffff 0%,#e3f2fd 35%,#bfe0f7 100%)}
.spark{position:absolute;color:#fff;opacity:.9;font-size:40px;text-shadow:0 0 12px #fff}
.logo{position:absolute;top:60px;left:50%;transform:translateX(-50%);width:560px}
.content{position:absolute;top:260px;left:70px;right:70px;bottom:70px;display:flex;flex-direction:column;align-items:center;text-align:center}
h1{font-family:'Fredoka',sans-serif;font-weight:700;font-size:84px;line-height:1.02;color:#1a3a8f;letter-spacing:-1px}
h1 .r{color:#e0202a}
h1 .s{display:inline-block;background:#e0202a;color:#fff;padding:0 26px;border-radius:22px;transform:rotate(-2deg)}
.sub{font-size:34px;font-weight:700;color:#3a4e86;margin-top:22px}
.kicker{display:inline-block;background:#1f4fa3;color:#fff;font-weight:800;font-size:30px;padding:10px 30px;border-radius:999px;margin-bottom:26px;letter-spacing:1px}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:26px;width:100%;margin-top:40px}
.cards.one{grid-template-columns:1fr}
.card{background:#fff;border-radius:30px;padding:28px 30px;display:flex;align-items:center;gap:22px;text-align:left;box-shadow:0 14px 34px rgba(31,79,163,.14)}
.card .ic{flex:0 0 96px;height:96px;border-radius:50%;background:#eaf3fd;display:flex;align-items:center;justify-content:center;font-size:52px}
.card .t{font-size:34px;font-weight:800;line-height:1.15;color:#17306b}
.card .d{font-size:24px;font-weight:700;color:#5d6f9c;margin-top:4px}
.btn{position:absolute;bottom:150px;left:50%;transform:translateX(-50%);background:#e0202a;color:#fff;font-family:'Fredoka';font-weight:700;font-size:46px;padding:22px 70px;border-radius:999px;box-shadow:0 14px 30px rgba(224,32,42,.35);white-space:nowrap}
.foot{position:absolute;bottom:70px;left:0;right:0;text-align:center;font-size:26px;font-weight:800;color:#1f4fa3}
.foot small{display:block;font-size:20px;font-weight:700;color:#5d6f9c;margin-top:6px}
.hero{width:460px;filter:drop-shadow(0 30px 40px rgba(31,79,163,.25))}
.content.mid{justify-content:center;bottom:160px}
.btn.flow{position:static;transform:none;margin-top:36px}
.swipe{position:absolute;right:70px;bottom:70px;font-family:'Fredoka';font-weight:600;font-size:30px;color:#1f4fa3}
.pg{position:absolute;left:70px;bottom:70px;font-weight:800;font-size:26px;color:#5d6f9c}
.badge{position:absolute;width:300px;height:300px;border-radius:50%;background:#e0202a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Fredoka';font-weight:700;line-height:1;transform:rotate(-10deg);box-shadow:0 18px 40px rgba(224,32,42,.35);border:10px solid #fff}
.badge b{font-size:96px}.badge span{font-size:34px;margin-top:6px}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:26px;width:100%;margin-top:40px}
.vs .col{background:#fff;border-radius:30px;padding:36px 28px;box-shadow:0 14px 34px rgba(31,79,163,.14)}
.vs .col h3{font-family:'Fredoka';font-size:40px;color:#1f4fa3;margin-bottom:14px}
.vs .col.red h3{color:#e0202a}
.vs .col .big{font-size:70px;line-height:1}
.vs .col p{font-size:30px;font-weight:800;color:#17306b;margin-top:16px;line-height:1.2}
.black{background:#111;border-radius:40px;padding:34px 40px;color:#fff;font-family:'Fredoka';font-weight:700;font-size:112px;line-height:.95;box-shadow:0 20px 50px rgba(0,0,0,.35);transform:rotate(-2deg)}
.black .r{color:#e0202a}.black small{display:block;font-size:40px;color:#9ad1ff;font-family:'Nunito';font-weight:800;margin-top:10px;letter-spacing:4px}
.prices{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;width:100%;margin-top:50px}
.price{background:#fff;border-radius:30px;padding:30px 16px;box-shadow:0 14px 34px rgba(31,79,163,.14)}
.price .n{font-size:26px;font-weight:800;color:#5d6f9c;min-height:64px;line-height:1.2}
.price .p{font-family:'Fredoka';font-weight:700;font-size:84px;color:#e0202a;line-height:1;margin-top:8px}
.price .o{font-size:24px;font-weight:800;color:#8b97b8;text-decoration:line-through;margin-top:6px}
.tag{display:inline-block;background:#fff;color:#e0202a;font-weight:900;font-size:30px;padding:12px 34px;border-radius:999px;margin-top:40px;box-shadow:0 10px 24px rgba(31,79,163,.14)}
.list{width:100%;margin-top:40px;display:flex;flex-direction:column;gap:20px}
.row{background:#fff;border-radius:999px;padding:18px 30px;display:flex;align-items:center;gap:20px;font-size:34px;font-weight:800;text-align:left;box-shadow:0 10px 26px rgba(31,79,163,.12)}
.row .e{font-size:44px}
`;
const sparks = `<div class="spark" style="top:120px;left:90px">✦</div><div class="spark" style="top:200px;right:110px;font-size:30px">✦</div><div class="spark" style="top:640px;left:40px;font-size:28px">✦</div><div class="spark" style="bottom:300px;right:60px">✦</div><div class="spark" style="top:900px;left:120px;font-size:24px">✦</div>`;
const wrap = (inner, extra='') => `<div class="page">${sparks}<img class="logo" src="${LOGO}">${inner}${extra}</div>`;
const foot = (t, s='') => `<div class="foot">${t}${s?`<small>${s}</small>`:''}</div>`;
const swipe = (i,n) => i<n ? `<div class="swipe">Desliza →</div><div class="pg">${i}/${n}</div>` : `<div class="pg">${i}/${n}</div>`;
const card = (ic,t,d='') => `<div class="card"><div class="ic">${ic}</div><div><div class="t">${t}</div>${d?`<div class="d">${d}</div>`:''}</div></div>`;
const row = (e,t) => `<div class="row"><span class="e">${e}</span>${t}</div>`;
const PH = 'El Monte (855) 618-0006 · Duarte (833) 952-8989 · Santa Fe Springs (844) 779-1400';

const designs = {};

// 1 Beneficios (5)
designs['02_beneficios'] = [
 wrap(`<div class="content mid"><img class="hero" src="${TOOTH}" style="width:380px;margin-bottom:10px"><h1>¿Sabías que tus beneficios dentales <span class="s">EXPIRAN</span><br>el 31 de diciembre?</h1><div class="sub">Did you know your dental benefits expire Dec 31?</div></div>`, swipe(1,5)),
 wrap(`<div class="content mid"><div class="kicker">ÚSALOS O PIÉRDELOS</div><h1>La mayoría de seguros <span class="r">NO acumulan</span> el saldo al año siguiente</h1><div class="cards one">${card('🏥','Medicare')}${card('🦷','Denti-Cal')}${card('📋','PPO y la mayoría de seguros')}</div></div>`, swipe(2,5)),
 wrap(`<div class="content mid"><div class="kicker">APROVECHA AHORA</div><h1>Lo que puedes <span class="r">cubrir</span> antes de fin de año</h1><div class="cards">${card('✨','Limpieza')}${card('🔍','Examen y rayos X')}${card('🦷','Rellenos')}${card('👑','Coronas')}</div></div>`, swipe(3,5)),
 wrap(`<div class="content mid"><h1>Sin <span class="r">excusas</span> para no venir</h1><div class="list">${row('⚡','Citas el mismo día')}${row('📅','Abiertos los sábados')}${row('🚶','Walk-ins bienvenidos')}${row('💳','Financiamiento desde 0%')}${row('🗣️','Hablamos español e inglés')}</div></div>`, swipe(4,5)),
 wrap(`<div class="content"><img class="hero" src="${TOOTH}" style="width:300px"><h1>Quedan pocas semanas.<br><span class="r">Agenda hoy.</span></h1><div class="sub">Las citas de diciembre se llenan rápido</div></div><div class="btn">Agenda tu cita →</div>`+foot('britechoicedental.com', PH), swipe(5,5)),
];

// 2 Implantes (1)
designs['06_implantes'] = [
 wrap(`<div class="content" style="top:230px"><h1>Implantes <span class="r">dentales</span></h1><div class="sub">Recupera tu sonrisa y tu confianza</div>
 <div style="position:relative;width:100%;height:360px;margin-top:0"><img src="${IMPLANT}" style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:340px;filter:drop-shadow(0 30px 40px rgba(31,79,163,.25))"><div class="badge" style="left:600px;top:30px;width:260px;height:260px"><b>$1,500</b><span>DE DESCUENTO</span></div></div>
 <div class="cards" style="margin-top:0">${card('✅','Valoración gratis')}${card('😁','Resultados naturales')}${card('💳','Financiamiento 0%')}${card('🛡️','Aceptamos seguros')}</div><div class="btn flow">Agenda tu cita →</div></div>`+foot('Válido hasta fin de mes · britechoicedental.com','*No combinable con otras ofertas · El Monte · Duarte · Santa Fe Springs')),
];

// 3 Diabetes (1)
designs['09_diabetes'] = [
 wrap(`<div class="content"><div class="kicker" style="background:#1f4fa3">🎗️ NOVIEMBRE · MES DE LA DIABETES</div><h1>Diabetes y encías: <span class="r">lo que nadie te dice</span></h1><div class="cards one">${card('📈','La diabetes triplica el riesgo de enfermedad de encías')}${card('🩸','Las encías inflamadas dificultan controlar el azúcar')}${card('🗓️','Una limpieza cada 6 meses protege ambos')}</div></div><div class="btn">Agenda tu revisión →</div>`+foot('britechoicedental.com','Aceptamos Medicare, Denti-Cal y PPO')),
];

// 4 Brackets vs alineadores (5)
const vs = (title,a,b,ea,eb) => `<div class="content mid"><h1>${title}</h1><div class="vs"><div class="col"><div class="big">${ea}</div><h3>Brackets</h3><p>${a}</p></div><div class="col red"><div class="big">${eb}</div><h3>Alineadores</h3><p>${b}</p></div></div></div>`;
designs['12_brackets_vs_alineadores'] = [
 wrap(`<div class="content mid"><img class="hero" src="${TOOTH}" style="width:340px"><h1>Brackets <span class="r">vs</span> Alineadores</h1><div class="sub">¿Cuál es para ti? · Braces vs aligners</div></div>`, swipe(1,5)),
 wrap(vs('<span class="r">Apariencia</span>','Visibles, metálicos o de cerámica','Casi invisibles','😬','😁'), swipe(2,5)),
 wrap(vs('Comida y <span class="r">limpieza</span>','Con restricciones; más difícil de cepillar','Se quitan para comer y cepillarte','🍿','🍎'), swipe(3,5)),
 wrap(vs('Tipo de <span class="r">caso</span>','Ideales para casos complejos','Casos leves a moderados','🧩','✅'), swipe(4,5)),
 wrap(`<div class="content"><h1>Te ayudamos a <span class="r">elegir</span></h1><div class="sub">Valoración + plan de pagos desde 0% de interés</div><div class="list" style="margin-top:50px">${row('📍','El Monte · Duarte · Santa Fe Springs')}${row('📅','Citas el mismo día y sábados')}</div></div><div class="btn">Agenda tu cita →</div>`+foot('britechoicedental.com', PH), swipe(5,5)),
];

// 5 Thanksgiving (4)
designs['23_thanksgiving'] = [
 wrap(`<div class="content mid"><div class="kicker" style="background:#d9771f">🦃 THANKSGIVING</div><h1>Alimentos que <span class="r">aman</span> y odian tus dientes</h1><img class="hero" src="${TOOTH}" style="width:360px;margin-top:30px"></div>`, swipe(1,4)),
 wrap(`<div class="content mid"><h1>Tus dientes <span class="r">aman</span> ❤️</h1><div class="cards one" style="margin-top:50px">${card('🦃','Pavo','Proteína y fósforo para el esmalte')}${card('🧀','Queso','Calcio y neutraliza ácidos')}${card('🥕','Vegetales crujientes','Limpian de forma natural')}${card('💧','Agua','Arrastra restos y azúcar')}</div></div>`, swipe(2,4)),
 wrap(`<div class="content mid"><h1>Tus dientes <span class="r">odian</span> 💀</h1><div class="cards one" style="margin-top:50px">${card('🥧','Pie de pecan','Pegajoso y lleno de azúcar')}${card('🫐','Salsa de arándano','Azúcar + ácido + manchas')}${card('🥤','Refrescos','Ácido que desgasta el esmalte')}${card('🍷','Vino tinto','Mancha los dientes')}</div></div>`, swipe(3,4)),
 wrap(`<div class="content"><h1>Disfruta las fiestas y <span class="r">agenda tu limpieza</span></h1><div class="tag">Nuevos pacientes: limpieza $179 (reg. $299)</div><img class="hero" src="${TOOTH}" style="width:280px;margin-top:30px"></div><div class="btn">Agenda tu cita →</div>`+foot('britechoicedental.com', 'Incluye limpieza, examen y rayos X · Oferta por tiempo limitado'), swipe(4,4)),
];

// 6 Black Friday (1)
designs['27_black_friday'] = [
 wrap(`<div class="content" style="top:250px"><div class="black">BLACK<br><span class="r">FRIDAY</span><small>DENTAL</small></div>
 <div class="prices"><div class="price"><div class="n">Examen + rayos X</div><div class="p">$49</div><div class="o">&nbsp;</div></div><div class="price"><div class="n">Limpieza completa</div><div class="p">$179</div><div class="o">reg. $299</div></div><div class="price"><div class="n">Blanqueamiento</div><div class="p">$380</div><div class="o">reg. $450</div></div></div>
 <div class="tag">Solo este fin de semana · Nuevos pacientes</div></div><div class="btn">Agenda tu cita →</div>`+foot('britechoicedental.com','El Monte · Duarte · Santa Fe Springs · Financiamiento 0%')),
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const [name, pages] of Object.entries(designs)) {
    for (let i = 0; i < pages.length; i++) {
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body style="margin:0">${pages[i]}</body></html>`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const f = path.join(OUT, `${name}${pages.length>1?`_p${i+1}`:''}.png`);
      await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1080, height: 1350 } });
      console.log('ok', path.basename(f));
    }
  }
  await browser.close();
})();
