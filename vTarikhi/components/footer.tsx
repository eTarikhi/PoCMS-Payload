import type React from "react";
import { useState } from "react";
import Link from "next/link";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faGem, faPhoneFlip, faHome, faEnvelope} from "@fortawesome/free-solid-svg-icons";
import {
    faFacebookF,
    faXTwitter,
    faInstagram,
    faLinkedin,
    faGithub,
    faWhatsapp,
} from "@fortawesome/free-brands-svg-icons";

// Define types for our data structures
interface SocialLink {
    name: string;
    url: string;
    iconName: string; // Name of the icon to use
    ariaLabel: string;
}

interface Skill {
    title: string;
}

interface ProfileLink {
    name: string;
    url: string;
}

interface ContactInfo {
    type: string;
    iconName: string; // Name of the icon to use
    content: string;
    url?: string;
    isLink?: boolean;
    className?: string;
}

interface FooterData {
    socialLinks: SocialLink[];
    personalInfo: {
        name: string;
        skills: Skill[];
    };
    profiles: ProfileLink[];
    contactInfo: ContactInfo[];
    copyright: {
        year: number;
        website: string;
        url: string;
    };
}

const awesomeIcon = {
    faFacebookF: <FontAwesomeIcon icon={faFacebookF} className="fab fa-facebook-f" aria-hidden="true"></FontAwesomeIcon>,
    faXTwitter: <FontAwesomeIcon icon={faXTwitter} className="fab fa-twitter" aria-hidden="true"></FontAwesomeIcon>,
    faInstagram: <FontAwesomeIcon icon={faInstagram} className="fab fa-instagram" aria-hidden="true"></FontAwesomeIcon>,
    faLinkedin: <FontAwesomeIcon icon={faLinkedin} className="fab fa-linkedin" aria-hidden="true"></FontAwesomeIcon>,
    faGithub: <FontAwesomeIcon icon={faGithub} className="fab fa-github" aria-hidden="true"></FontAwesomeIcon>,
    faWhatsapp: <FontAwesomeIcon icon={faWhatsapp} className="fab fa-whatsapp" aria-hidden="true"></FontAwesomeIcon>,
    faWhatsappc: <FontAwesomeIcon icon={faWhatsapp} className="fab fa-whatsapp me-3 text-secondary" aria-hidden="true"></FontAwesomeIcon>,
    faGem: <FontAwesomeIcon icon={faGem} className="fas fa-gem me-3 text-secondary" aria-hidden="true"></FontAwesomeIcon>,
    faHome: <FontAwesomeIcon icon={faHome} className="fas fa-home me-3 text-secondary" aria-hidden="true"></FontAwesomeIcon>,
    faEnvelope: <FontAwesomeIcon icon={faEnvelope} className="fas fa-envelope me-3 text-secondary" aria-hidden="true" ></FontAwesomeIcon>,
    faPhoneFlip: <FontAwesomeIcon icon={faPhoneFlip} className="fas fa-phone me-3 text-secondary" aria-hidden="true" ></FontAwesomeIcon>,
};

// Import JSON data from local database file
const jsonDB = require("./database.json");

// Map JSON data to defined interfaces
const jsonFooter: FooterData[] = jsonDB.map((data) => data.footer);
const footerData = jsonFooter[0];

console.log("FooterData:", footerData);

const Footer: React.FC = () => {
    const currentYear = new Date().getFullYear();
    const [emailRevealed, setEmailRevealed] = useState(false)

    const revealEmail = (encodedEmail: string) => {
        const [username, domain] = encodedEmail.split("@");
        return `${username}@${domain}`;
    };
  
    return (
        <footer className="text-center text-lg-start bg-dark text-white">
            {/* Section: Social media */}
            <section>
                <div className="container d-flex justify-content-center justify-content-lg-between p-4">
                    {/* Left */}
                    <div className="me-5 d-none d-lg-block">
                        <span>Get connected with me on social networks:</span>
                    </div>
                    {/* Right */}
                    <div className="ml-4">
                        {footerData.socialLinks.map((social, index) => (
                            <Link
                                key={index}
                                href={social.url}
                                target="_blank"
                                aria-label={social.ariaLabel}
                                className="me-4 link-secondary"
                                title={social.ariaLabel}
                            >
                                {awesomeIcon[social.iconName as keyof typeof awesomeIcon]}
                            </Link>
                        ))}{" "}
                    </div>
                </div>
            </section>

            {/* Section: Links */}
            <section>
                <div className="container text-center text-md-start px-md-4 mt-5">
                    <div className="row mt-3">
                        {/* Personal Info Column */}
                        <aside className="col-md-5 mx-auto mb-4">
                            <h2 className="h6 text-uppercase fw-bold mb-4">
                                <FontAwesomeIcon
                                    icon={faGem}
                                    className="fas fa-gem me-3 text-secondary"
                                    aria-hidden="true"
                                />
                                <span className="text-secondary">{footerData.personalInfo.name} </span>
                            </h2>
                            <ul>
                                {footerData.personalInfo.skills.map((skill, index) => (
                                    <li key={index}>{skill.title}</li>
                                ))}
                            </ul>
                        </aside>

                        {/* Profiles Column */}
                        <nav className="col-md-4 mx-auto mb-4">
                            <h2 className="h6 text-uppercase fw-bold mb-4">My Profiles</h2>
                            {footerData.profiles.map((profile, index) => (
                                <p key={index}>
                                    <Link href={profile.url} title={profile.name} target="_blank" className="text-reset">
                                        {profile.name}
                                    </Link>
                                </p>
                            ))}
                        </nav>

                        {/* Contact Column */}
                        <nav className="col-md-3 mx-auto mb-md-0 mb-4" id="contact">
                            <h2 className="h6 text-uppercase fw-bold mb-4">Contact</h2>
                            {footerData.contactInfo.map((contact, index) => (
                                <p key={index}>
                                    {awesomeIcon[contact.iconName as keyof typeof awesomeIcon]}
                                    {contact.type === "email" ? (
                                        <span
                                            className={contact.className}
                                            onClick={() => setEmailRevealed(true)}
                                            style={{cursor: "pointer"}}
                                            title={emailRevealed ? "Click to email" : "Click to reveal email"}
                                        >
                                            {emailRevealed ? (
                                                <Link className={contact.className} href={`mailto:${revealEmail(contact.content)}`} target="_blank">
                                                    {revealEmail(contact.content)}
                                                </Link>
                                            ) : (
                                                "Click to reveal email"
                                            )}
                                        </span>
                                    ) : contact.isLink ? (
                                        <Link className={contact.className} href={contact.url || "#"} title={contact.type} target="_blank">
                                            {contact.content}
                                        </Link>
                                    ) : (
                                        contact.content
                                    )}
                                </p>
                            ))}
                        </nav>
                    </div>
                </div>
            </section>

            {/* Copyright */}
            <div
                className="text-center p-3"
                style={{
                    backgroundColor: "#0e1017",
                    fontSize: "smaller",
                }}
            >
                Copyright © 2023{" "}
                <Link className="text-white" href={footerData.copyright.url}>
                    {footerData.copyright.website}{" "}
                </Link>
                , All Rights Reserved.
            </div>
        </footer>
    );
};

export default Footer;
