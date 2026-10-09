// import '../global.css';
// import 'bootstrap/dist/css/bootstrap.min.css';
import "bootstrap-icons/font/bootstrap-icons.min.css";
import "../styles/bootstrap.min.css";
import "../styles/main.css";
// import "bootstrap/dist/css/bootstrap.min.css";
// import '../public/libraries/animate/animate.min.css';
// import '../public/libraries/lightbox/css/lightbox.min.css';
// import '../public/libraries/owlcarousel/assets/owl.carousel.min.css';
// import 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap';
// import 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.10.0/css/all.min.css';
// import 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.4.1/font/bootstrap-icons.css';

import {Open_Sans} from "next/font/google";

const inter = Open_Sans({
    weight: ["400", "500", "600", "700"],
    style: ["normal"],
    subsets: ["latin"],
    display: "swap",
});

import {config} from "@fortawesome/fontawesome-svg-core";
import "@fortawesome/fontawesome-svg-core/styles.css";
config.autoAddCss = false;

export default function MyApp({Component, pageProps}) {
    return (
        <>
            <style jsx global>{`
                html {
                    font-family: ${inter.style.fontFamily};
                }
            `}</style>
            <Component {...pageProps} />
        </>
    );
}
