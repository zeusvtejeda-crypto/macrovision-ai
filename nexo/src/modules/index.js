// Registro automático de módulos: cada carpeta src/modules/<nombre>/index.jsx exporta
// { routes: { nombreDeRuta: Componente }, widgets?: { home?: Componente, more?: [{to, label, icon}] } }.
import { lazy } from 'react';

const files = import.meta.glob('./*/index.jsx');

const routeOwners = {}; // routeName -> () => import(...)
const modules = Object.entries(files).map(([path, loader]) => ({ name: path.split('/')[1], loader }));

// Carga perezosa por ruta: el módulo dice qué rutas atiende al cargarse. Para saberlo sin cargar todo,
// cada módulo declara también sus rutas en src/modules/manifest.js.
export { modules };

export function lazyRoute(loader, routeName) {
  return lazy(async () => {
    const mod = await loader();
    const def = mod.default || mod;
    const Comp = def.routes?.[routeName];
    return { default: Comp || (() => null) };
  });
}

export function lazyWidget(loader, widgetName) {
  return lazy(async () => {
    const mod = await loader();
    const def = mod.default || mod;
    return { default: def.widgets?.[widgetName] || (() => null) };
  });
}

export const routeOwnersRef = routeOwners;
