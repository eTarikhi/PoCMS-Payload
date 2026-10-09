import Image from "next/image";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faCheck} from "@fortawesome/free-solid-svg-icons";

// Define the structure for the about content props
interface AboutContentProps {
    id: number;
    experience: {
        years: number;
        title: string;
        description: string;
    };
    workPermit: {
        title: string;
        description: string;
    };
    images: string[];
    interests: {
        title: string;
        description: string;
        areas: string[];
    };
}

// Import the JSON database and map it to the AboutContentProps structure
const jsonDB = require("./../database.json");
const aboutContent: AboutContentProps[] = jsonDB.map((data) => data.about);

console.log(aboutContent);

// Define the AboutSection component
const AboutSection = () => {
    return (
        <section id="about">
            <div className="container-xxl py-6">
                <div className="container">
                    {/* Map through each content item in aboutContent */}
                    {aboutContent.map((content, index) => (
                        <div key={index} className="row g-5">
                            {/* Left column: Experience and Work Permit */}
                            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
                                {/* Experience section */}
                                <div className="row d-flex align-items-center mb-5">
                                    <div className="col-md-6 flex-shrink-0 text-center me-4">
                                        <h2>
                                            <span className="display-1 mb-0">{content.experience.years}+</span>
                                            <br className="g-0" />
                                            <span className="years mb-0">Years</span>
                                        </h2>
                                    </div>
                                    <div className="col-md-4 text-center me-4 mt-4">
                                        <h3 className="lh-middle">{content.experience.title}</h3>
                                    </div>
                                </div>
                                <p className="mb-4">{content.experience.description}</p>

                                {/* Work Permit section */}
                                <div className="d-flex align-items-center mb-3">
                                    <h3 className="h5 border-end pe-3 me-3 mb-0">{content.workPermit.title}</h3>
                                </div>
                                <p className="mb-0">{content.workPermit.description}</p>
                            </div>

                            {/* Right column: Images and Interests */}
                            <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.5s">
                                {/* Image gallery */}
                                <div className="row g-3 mb-4">
                                    {content.images.map((src, index) => (
                                        <div key={index} className="col-sm-6">
                                            <Image
                                                className="img-fluid rounded"
                                                src={src || "/images/placeholder.svg"}
                                                alt="About Amir v.Tarikhi"
                                                width={400}
                                                height={400}
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Interests section */}
                                <div className="d-flex align-items-center mb-3">
                                    <h3 className="h5 border-end pe-3 me-3 mb-0">{content.interests.title}</h3>
                                </div>
                                <p className="mb-4">{content.interests.description}</p>
                                {/* List of interest areas */}
                                {content.interests.areas.map((area, index) => (
                                    <h2 key={index} className="p h6 mb-3">
                                        <FontAwesomeIcon icon={faCheck} className="far fa-check-circle text-primary me-3" />
                                        <span>{area}</span>
                                    </h2>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default AboutSection; // Export the AboutSection component