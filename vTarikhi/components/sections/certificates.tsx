import React from "react";
import Image from "next/image";
import Link from "next/link";

interface CertificatesProps {
    id: number;
    title: string;
    issuer: string;
    date: string;
    imageUrl: string;
    link?: string;
    map; // Not sure what this is for, could you provide more context?
    filter; // Add the filter property to the interface
}

// Import JSON data from local database file
const jsonDB = require("./../database.json");

// Map JSON data to defined interfaces
const jsonCertificates: CertificatesProps[] = jsonDB.map((data) => data.certificates);
const certificatesItems = jsonCertificates[0];

console.log("certificates:", certificatesItems);

function CertificateSection() {
    return (
        <section id="certificate">
            <div className="container-xxl py-5">
                <div className="row g-5">
                    <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
                        {/* Section Title */}
                        <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
                            <div className="col-lg-6">
                                <h2 className="display-5 mb-0">Recent Certificates</h2>
                            </div>
                            <div className="col-lg-6 text-lg-end">
                                <Link
                                    className="btn btn-primary py-3 px-5"
                                    target="_blank"
                                    href="https://www.linkedin.com/in/etarikhi/details/certifications/"
                                >
                                    All Certificates &gt;
                                </Link>
                            </div>
                        </div>
                        <div className="row gy-1 gx-4 align-items-center">
                            {certificatesItems.map((cert) => (
                                <div key={cert.id} className="col-lg-4 col-md-6">
                                    <div
                                        
                                        className="service-item rounded h-100 p-4 p-lg-5 my-2 wow fadeInUp"
                                    >
                                        <div className="rounded overflow-hidden">
                                            <Image
                                                className="img-fluid"
                                                src={cert.imageUrl}
                                                alt={cert.title}
                                                width={330}
                                                height={255}
                                                loading="lazy"
                                            />
                                        </div>
                                        <div className="p-6">
                                            <h3 className="my-2">{cert.title}</h3>
                                            <p className="mb-2">Issued by: {cert.issuer}</p>
                                            <p className="mb-4">{cert.date}</p>
                                            {cert.link && (
                                                <Link
                                                    href={cert.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="btn btn-primary mx-1"
                                                >
                                                    View Certificate →
                                                </Link>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

export default CertificateSection;
