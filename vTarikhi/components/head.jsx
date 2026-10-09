
import React from 'react';
import Head from 'next/head';
// import Link from 'next/link';
import Script from "next/script";
// import * as jsonld from 'jsonld';
const jsonld = require("./schema.json");
const jsonSchema = JSON.stringify(jsonld);

// console.log(jsonSchema);

const HeadBlock = () => {
    return (
        <Head>

            {/* <Script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }}>{ jsonSchema }</Script> */}
            <script type="application/ld+json" >{ jsonSchema }</script>

            {/* <meta charset='utf-8'></meta> */}
            <title>Amir v.Tarikhi Live Resume | Full-Stack Senior Web Developer</title>
            {/* <meta http-equiv='Content-Type' content='text/html; charset=utf-8'></meta> */}
            <meta name='X-Content-Type-Options' content='application/javascript; charset=utf-8'></meta>
            <meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=10, user-scalable=yes'></meta>
            <meta name='description' content='Senior PHP, JavaScript & MySQL, Mid. React & Next.js, Jr. Node.js & Laravel, E-Commerce CMS, WordPress, WooCommerce & Shopify Developer ..'></meta>
            <meta name='keywords' content='Senior Web Developer, Full-Stack Developer, PHP Developer, JavaScript Developer, Next.js Developer, React.js Developer, Shopify Developer, MySQL Developer, Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant'></meta>
            <meta name='theme-color' content='#da9100'></meta>
            <meta name='robots' content='index, follow'></meta>
            <meta name='owner' content='Amir v.Tarikhi'></meta>

			<link rel="shortcut icon" href="/images/favicon/favicon.ico" ></link>
			<link rel="icon" type="image/svg+xml" href="/images/favicon/favicon.svg" ></link>
			<link rel="icon" type="image/png" href="/images/favicon/favicon-16x16.png" sizes="16x16" ></link>
			<link rel="icon" type="image/png" href="/images/favicon/favicon-32x32.png" sizes="32x32" ></link>
			<link rel="icon" type="image/png" href="/images/favicon/favicon-96x96.png" sizes="96x96" ></link>
			<link rel="apple-touch-icon" href="/images/favicon/apple-touch-icon.png" sizes="180x180" ></link>
			<link rel="manifest" href="/images/favicon/site.webmanifest" ></link>

            <meta name='twitter:card' content='summary_large_image'></meta>
            <meta property='og:site_name' content='Amir v.Tarikhi Live Resume'></meta>
            <meta property='og:site' content='https://www.etarikhi.com' ></meta>
            <meta property='og:title' content='Amir v.Tarikhi Live Resume'></meta>
            <meta property='og:description' content='Full-Stack Senior PHP Developer, Automation Panel Developer, E-Commerce CMS Developer, SEO Manager and Consultant' ></meta>
            <meta property='og:image' content='//www.etarikhi.com/assets/img/profile.png' ></meta>
            <meta property='og:image:secure_url' content='//www.etarikhi.com/assets/img/profile.png' ></meta>
            <meta property='og:image:type' content='text/html' ></meta>
            <meta property='og:image:height' content='400' ></meta>
            <meta property='og:image:alt' content='Amir v.Tarikhi' ></meta>
            <meta property='og:url' content='https://www.etarikhi.com' ></meta>
            <meta property='og:locale' content='en_US' ></meta>
            <meta property='fb:page_id' content=''></meta>

            <meta property='fb:pages' content=''></meta>
            <meta property='ia:markup_url' content=''></meta>
            <meta property='ia:markup_url_dev' content=''></meta>
            <meta property='ia:rules_url' content=''></meta>
            <meta property='ia:rules_url_dev' content=''></meta>

            <link rel="preload" href="/images/bg-mobile.webp" as="image" data-next-head="preload-background" ></link>
            <link rel="preload" href="/images/bg-desktop.webp" as="image" data-next-head="preload-background" ></link>

            {/*

            <Script id="preload-background" strategy="afterInteractive">
            {`
                const desktop = document.createElement('link');
                desktop.rel = 'preload';
                desktop.as = 'image';
                desktop.href = '/images/bg-desktop.webp';
                document.head.appendChild(desktop);

                const mobile = document.createElement('link');
                mobile.rel = 'preload';
                mobile.as = 'image';
                mobile.href = '/images/bg-mobile.webp';
                document.head.appendChild(mobile);
            `}
            </Script>

            <Link rel="preload" href="/images/bg-mobile.webp" as="image"></Link>
            <Link rel="preload" href="/images/bg-desktop.webp" as="image"></Link>

            <link href='img/favicon.ico' rel='icon'></link>

            <link rel='preconnect' href='https://fonts.googleapis.com'></link>
            <link rel='preconnect' href='https://fonts.gstatic.com' crossorigin></link>
            <link href='https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap' rel='stylesheet'></link>

            <link href="libraries/animate/animate.min.css" rel="stylesheet"></link>
            <link href="libraries/lightbox/css/lightbox.min.css" rel="stylesheet"></link>
            <link href="libraries/owlcarousel/assets/owl.carousel.min.css" rel="stylesheet"></link>

            <link href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.10.0/css/all.min.css' rel='stylesheet'></link>

            <link rel="dns-prefetch" href="https://fonts.gstatic.com"></link>
            <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com"></link>
            <link rel="dns-prefetch" href="https://cdn.jsdelivr.net"></link>
            <link rel="dns-prefetch" href="https://www.etarikhi.com"></link>

            <link rel="dns-prefetch" href="https://fonts.googleapis.com"></link>

            <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin></link>

            <link rel="stylesheet" href='https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap'></link>

            */}

        </Head>
    );
};

export default HeadBlock;