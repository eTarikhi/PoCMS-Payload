
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

const Menu = () => {

    const handleLinkClick = () => {
        const navbarCollapse = document.getElementById('navbarCollapse');
        if (navbarCollapse && typeof window !== 'undefined') {
            const bsCollapse = new (require('bootstrap')).Collapse(navbarCollapse);
            bsCollapse.hide();
        }
    };

    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
      const handleScroll = () => {
        if (window.scrollY > 300) {
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      };
  
      window.addEventListener('scroll', handleScroll);

      return () => window.removeEventListener('scroll', handleScroll);

    }, []);
  
    return (
        <nav className={`navbar navbar-expand-lg bg-dark navbar-dark fixed-top shadow py-lg-0 px-4 px-lg-5 wow fadeIn ${isVisible ? 'd-flex' : ''}`} data-wow-delay="0.1s">
            <Link href="index.html" className="navbar-brand d-block d-lg-none">
                <h2 className="h1 text-primary fw-bold m-0">eTarikhi</h2>
            </Link>
            <button type="button" className="navbar-toggler" onClick={handleLinkClick}>
                <span className="navbar-toggler-icon"></span>
            </button>
            <div className="collapse navbar-collapse justify-content-between py-4 py-lg-0" id="navbarCollapse">
                <div className="navbar-nav ms-auto py-0">
                    <Link href="#home" className="nav-item text-light nav-link active" onClick={handleLinkClick}>Home</Link>
                    <Link href="#about" className="nav-item text-light nav-link" onClick={handleLinkClick}>About</Link>
                    <Link href="#skill" className="nav-item text-light nav-link" onClick={handleLinkClick}>Skills</Link>
                </div>
                <Link href="index.html" className="navbar-brand bg-primary py-3 px-4 mx-3 d-none d-lg-block">
                    <h2 className="h1 text-white fw-bold m-0">eTarikhi</h2>
                </Link>
                <div className="navbar-nav me-auto py-0">
                    <Link href="#service" className="nav-item text-light nav-link" onClick={handleLinkClick}>Services</Link>
                    <Link href="#project" className="nav-item text-light nav-link" onClick={handleLinkClick}>Projects</Link>
                    <Link href="#contact" className="nav-item text-light nav-link" onClick={handleLinkClick}>Contact</Link>
                </div>
            </div>
        </nav>
    );
};

export default Menu;