import React from 'react';
import Link from 'next/link';
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCode, faCropAlt, faLaptopCode, faCodeBranch} from "@fortawesome/free-solid-svg-icons";

interface ServicesProps {
    id: Number,
    category: String,
    iconFont: String,
    descriptions: Array<String>,
    map; // Not sure what this is for, could you provide more context?
    filter; // Add the filter property to the interface
};

const awesomeIcon = {
    "faCode": <FontAwesomeIcon icon={faCode} className="fa fa-code fa-2x text-dark" ></FontAwesomeIcon>,
    "faCropAlt": <FontAwesomeIcon icon={faCropAlt} className="fa fa-crop-alt fa-2x text-dark" ></FontAwesomeIcon>,
    "faLaptopCode": <FontAwesomeIcon icon={faLaptopCode} className="fa fa-laptop-code fa-2x text-dark" ></FontAwesomeIcon>,
    "faCodeBranch": <FontAwesomeIcon icon={faCodeBranch} className="fa fa-code-branch fa-2x text-dark" ></FontAwesomeIcon>,
};

// Import JSON data from local database file
const jsonDB = require("./../database.json");

// Map JSON data to defined interfaces
const jsonServices: ServicesProps[] = jsonDB.map((data) => data.services.items);
const jsonHiring: ServicesProps[] = jsonDB.map((data) => data.services.hiring);
const Services = jsonServices[0];
const Hiring = jsonHiring[0];

console.log("Services:", Services);
console.log("Hiring:", Hiring);

function ServiceItem({id, category, iconFont, descriptions}: ServicesProps) {
    return (
        <div key={id.toString()} className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
            <div className="service-item d-flex flex-column flex-sm-row bg-white rounded h-100 p-4 p-lg-5">
                <div className="bg-icon flex-shrink-0 mb-3">
                    {awesomeIcon[iconFont as keyof typeof awesomeIcon]}
                </div>
                <div className="ms-sm-4">
                    <h3 className="h4 mb-3">{category}</h3>
                    {descriptions.map((service, index) => (
                        <h4 key={index} className="p service-description">{service}</h4>
                    ))}
                </div>
            </div>
        </div>
    )
}

const ServiceSection = () => {
    return (
        <section id="service" className="section-gray">
            <div className="container-fluid my-1 pb-5" >
                <div className="container">
                    <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
                        <div className="col-lg-6">
                            <h2 className="display-5 mb-0">My Services</h2>
                        </div>
                        <div className="col-lg-6 text-lg-end">
                        {Hiring.map((hire, index) =>
                            <Link className="btn btn-primary py-3 px-5" href={hire.link} target="_blank">{hire.title}</Link>
                        )}
                        </div>
                    </div>
                    <div className="row g-4">
                        {Services.map((service, index) => ( ServiceItem(service) ))}
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ServiceSection;