import './style.css';
export const metadata={title:'Quanta15',description:'Live 15-minute crypto prediction-market intelligence',manifest:'/manifest.webmanifest'};
export const viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#07111f'};
export default function Layout({children}){return <html lang="en"><body>{children}</body></html>}
