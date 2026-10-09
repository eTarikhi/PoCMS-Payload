// Import necessary React modules
import * as React from "react";
import {useEffect, useRef, useState} from "react";
import {motion, useInView} from "framer-motion";

// Define interfaces for education, experience, skills, and progress bar
interface EducationsProps {
    id: number; // Unique identifier for education
    title?: string; // Optional education title
    date?: string; // Optional education date
    location?: string; // Optional education location
    map; // Not sure what this is for, could you provide more context?
}

interface ExperiencesProps {
    id: number; // Unique identifier for experience
    title?: string; // Optional experience title
    date?: string; // Optional experience date
    company?: string; // Optional company name for experience
    map; // Not sure what this is for, could you provide more context?
}

interface SkillsProps {
    frontend: Array<ProgressBarProps>; // Array of progress bar props for frontend skills
    backend: Array<ProgressBarProps>; // Array of progress bar props for backend skills
}

interface ProgressBarProps {
    id: number; // Unique identifier for progress bar
    value: number; // Value of progress bar (out of 100)
    label?: string; // Optional label for progress bar
    color?: string; // Optional color for progress bar
    delay?: number; // Optional delay for progress bar animation (in seconds)
}

// Import JSON data from local database file
const jsonDB = require("./../database.json");

// Map JSON data to defined interfaces
const skills: SkillsProps[] = jsonDB.map((data) => data.skills);
const educations: EducationsProps[] = jsonDB.map((data) => data.educations);
const experiences: ExperiencesProps[] = jsonDB.map((data) => data.experiences);

// Log data for debugging purposes
console.log("Skills:", skills);
console.log("Educations:", educations);
console.log("Experiences:", experiences);

// Functional component for displaying experience details
const Experiences: React.FC<ExperiencesProps> = ({id, title, date, company}) => (
    // Use col-sm-6 to make this component take up half the screen on small and medium screens
    <div key={id} className="col-sm-6">
        <h5>{title}</h5>
        <hr className="text-primary my-2" />
        <p className="text-primary mb-1">{date}</p>
        <h6 className="mb-0">{company}</h6>
    </div>
);

// Functional component for displaying education details
const Educations: React.FC<EducationsProps> = ({id, title, date, location}) => (
    // Use col-sm-6 to make this component take up half the screen on small and medium screens
    <div key={id} className="col-sm-6">
        <h5>{title}</h5>
        <hr className="text-primary my-2" />
        <p className="text-primary mb-1">{date}</p>
        <h6 className="mb-0">{location}</h6>
    </div>
);

// Functional component for displaying a progress bar with animation
const ProgressBar: React.FC<ProgressBarProps> = ({id, value, label, color, delay}) => {
    // Get a reference to the progress bar element
    const ref = useRef(null);

    // Check if the progress bar is in view
    const isInView = useInView(ref, {
        once: true,
        amount: 0.3,
        margin: "0px 0px -50px 0px",
    });

    // Initialize progress state to 0
    const [progress, setProgress] = useState(0);

    // Animate progress bar on mount
    useEffect(() => {
        if (isInView) {
            // Set a timeout to animate the progress bar after a delay
            const timer = setTimeout(() => {
                setProgress(value);
            }, delay * 1000);

            // Clear the timeout on unmount
            return () => clearTimeout(timer);
        }
    }, [isInView, value, delay]);

    // Return the progress bar element with animation
    return (
        // Use a unique key to identify this progress bar
        <div key={id} ref={ref} className="skill mb-4">
            {label && (
                // Display a label and progress percentage if a label is provided
                <div className="d-flex justify-content-between">
                    <h4 className="h6 font-weight-bold">{label}</h4>
                    <h5 className="h6 font-weight-bold">{progress}%</h5>
                </div>
            )}
            <div className="progress">
                {/* Use Framer Motion to animate the progress bar */}
                <motion.div
                    className={`progress-bar bg-${color}`}
                    initial={{width: "0%"}}
                    animate={{width: `${progress}%`}}
                    transition={{duration: 1, delay: delay}}
                />
            </div>
        </div>
    );
};

// Main skill section component
const SkillSection: React.FC = () => {
    // Check if skills, educations, and experiences data are available
    if (!skills || !educations || !experiences) {
        console.error("Skills data is not in the expected format:", skills);
        return <div>Error: Skills, Educations or Experiences data is not available</div>;
    }

    // Return the main skill section component
    return (
        <section id="skill">
            <div className="container-xxl py-5">
                <div className="container">
                    <div className="row g-5">
                        {/* Skills display section */}
                        <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.1s">
                            <h2 className="display-5 mb-5">Skills & Experience</h2>
                            <p className="mb-4">Some of my top skills listed as below.</p>
                            <h3 className="mb-4">My Skills</h3>
                            {skills.map((item, index) => (
                                <div key={index} className="row align-items-center tab-pane">
                                    <div className="col-md-6">
                                        {item.frontend.map((skill) => (
                                            <ProgressBar key={skill.id} {...skill} />
                                        ))}
                                    </div>
                                    <div className="col-md-6">
                                        {item.backend.map((skill) => (
                                            <ProgressBar key={skill.id} {...skill} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {/* Experience and education tabs */}
                        <div className="col-lg-6 wow fadeInUp" data-wow-delay="0.5s">
                            <ul className="nav nav-pills rounded border border-2 border-primary mb-5">
                                <li className="nav-item w-50">
                                    <a
                                        className="nav-link w-100 py-3 fs-5 text-center active"
                                        id="experience"
                                        data-bs-toggle="pill"
                                        href="#tab-1"
                                    >
                                        Experience
                                    </a>
                                </li>
                                <li className="nav-item w-50">
                                    <a
                                        className="nav-link w-100 py-3 fs-5 text-center"
                                        id="education"
                                        data-bs-toggle="pill"
                                        href="#tab-2"
                                    >
                                        Education
                                    </a>
                                </li>
                            </ul>
                            <div className="tab-content">
                                <div id="tab-1" className="tab-pane fade show p-0 active">
                                    {experiences &&
                                        experiences.map((item, index) => (
                                            <div key={index} className="row gy-5 gx-4">
                                                {item.map((experience) => (
                                                    <Experiences key={experience.id} {...experience} />
                                                ))}
                                            </div>
                                        ))}
                                </div>
                                <div id="tab-2" className="tab-pane fade show p-0">
                                    {educations &&
                                        educations.map((item, index) => (
                                            <div key={index} className="row gy-5 gx-4">
                                                {item.map((education) => (
                                                    <Educations key={education.id} {...education} />
                                                ))}
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default SkillSection;