import React, {useState, useEffect} from "react";
import {motion, AnimatePresence} from "framer-motion";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import { faEye, faLink } from "@fortawesome/free-solid-svg-icons";
import Image from "next/image";

/**
 * Interface defining the structure of a project category
 */
interface CategoryProps {
    id: number;
    category: string;
    class: string;
    map; // Not sure what this is for, could you provide more context?
    filter; // Add the filter property to the interface
}
/**
 * Interface defining the structure of a project item
 */
interface ProjectProps {
    id: number;
    category: string;
    class: string[];
    placeHolder: string;
    src: string;
    alt: string;
    url: string;
    map; // Not sure what this is for, could you provide more context?
    filter; // Add the filter property to the interface
}

// Import JSON data from local database file
const jsonDB = require("./../database.json");

// Map JSON data to defined interfaces
const jsonCategories: CategoryProps[] = jsonDB.map((data) => data.projects.categories);
const jsonItems: ProjectProps[] = jsonDB.map((data) => data.projects.items);

const cats = jsonCategories[0];
const items = jsonItems[0];

// Log data for debugging purposes
console.log("Categories:", cats);
console.log("Projects:", items);

// Pixel GIF code adapted from https://stackoverflow.com/a/33919020/266535
const keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

const triplet = (e1: number, e2: number, e3: number) => keyStr.charAt(e1 >> 2) + keyStr.charAt(((e1 & 3) << 4) | (e2 >> 4)) + keyStr.charAt(((e2 & 15) << 2) | (e3 >> 6)) + keyStr.charAt(e3 & 63);

/**
 * Creates a triplet of numbers in the range [start, end]
 * 
 * param start - The starting number
 * param end - The ending number
 * returns {string} The triplet of numbers
 */
const rgbDataURL = (r: number, g: number, b: number) => `data:image/gif;base64,R0lGODlhAQABAPAA${triplet(0, r, g) + triplet(b, 255, 255)}/yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==`;

/**
 * ProjectSection Component
 * 
 * A responsive project portfolio section that displays projects in a grid layout
 * with filtering capabilities and smooth animations.
 * 
 * Features:
 * - Filtering projects by category
 * - Loading states with spinner
 * - Smooth transitions using Framer Motion
 * - Responsive grid layout
 * - Image hover effects
 * 
 * returns {JSX.Element} The rendered project section
 */
function ProjectSection() {

    // Initialize state with items to avoid unnecessary useEffect call
    const [portfolioItems, setPortfolioItems] = useState(items);
    const [filteredItems, setFilteredItems] = useState(items);
    const [activeFilter, setActiveFilter] = useState("*");
    const [isLoading, setIsLoading] = useState(true);

    // Remove loading state after initial render
    useEffect(() => {
        setIsLoading(false);
    }, []);

    /**
     * Handles the filter change when a category is selected
     * 
     * param filter - The selected filter category
     */
    const handleFilterChange = (filter: string) => {
        setIsLoading(true);
        setActiveFilter(filter);

        setTimeout(() => {
            if (filter === "*") {
                setFilteredItems(portfolioItems);
            } else {
                const filtered = portfolioItems.filter((item) => item.class.includes(filter));
                setFilteredItems(filtered);
            }
            setIsLoading(false);
        }, 100); // Adding slight delay for smooth transition
    };

    return (
        <section id="project" className="section-gray">
            <div className="container-fluid py-5">
                <div className="container">
                    <div className="row g-5 mb-5 align-items-center wow fadeInUp" data-wow-delay="0.1s">
                        {/* Section Title */}
                        <div className="col-lg-6">
                            <h2 className="h1 display-5 mb-0">My Projects</h2>
                        </div>
                        {/* Category Filter Buttons */}
                        <div className="col-lg-6 text-lg-end">
                            <motion.ul className="list-inline mx-auto mb-0" id="portfolio-flters">
                                {cats.map((cat) => (
                                    <motion.li
                                        key={cat.id}
                                        className={`m-3 ${activeFilter === cat.class ? "active" : ""}`}
                                        onClick={() => handleFilterChange(cat.class)}
                                        whileHover={{scale: 1.05}}
                                        whileTap={{scale: 0.95}}
                                    >
                                        {cat.category}
                                    </motion.li>
                                ))}
                            </motion.ul>
                        </div>
                    </div>

                    {/* Portfolio Items */}
                    <AnimatePresence mode="wait">
                        {
                        // isLoading ? (
                        //     <motion.div
                        //         className="justify-center items-center h-32"
                        //         initial={{opacity: 0}}
                        //         animate={{opacity: 1}}
                        //         exit={{opacity: 0}}
                        //     >
                        //         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        //     </motion.div>
                        // ) : 
                        (
                            <motion.div
                                className="row g-4 portfolio-container wow fadeInUp"
                                initial={{opacity: 0}}
                                animate={{opacity: 1}}
                                exit={{opacity: 0}}
                                transition={{duration: 0.3}}
                            >
                                {/* Project Cards Function Call */}
                                {filteredItems.map((item) => projectCards(item))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
}

/**
 * projectCards Component
 * 
 * returns Project Cards
 */
function projectCards(item) {

    /**
     * Handles image source override with large scale image when the placeholder image load completed for improving pagespeed performance ..
     * param event - React's synthetic event containing the image element that triggered the error
     * returns void
     */
    const handleImageOverride = (event: React.SyntheticEvent<HTMLImageElement>) => {
        const target = event.target as HTMLImageElement;
        target.src = item.src;
    };

    return (
        <motion.div
            key={item.id}
            layout
            initial={{opacity: 0, scale: 0.9}}
            animate={{opacity: 1, scale: 1}}
            exit={{opacity: 0, scale: 0.9}}
            transition={{duration: 0.5}}
            className="col-lg-4 col-md-6 portfolio-item"
        >
            <div className="portfolio-img rounded overflow-hidden">

                {/* Project Image */}
                <Image
                    className="img-fluid"
                    src={item.placeHolder}
                    alt={item.alt}
                    width={400}
                    height={400}
                    loading="lazy"
                    unoptimized = {true} // Important for handleImageOverride() to work
                    onLoad = {handleImageOverride}

                    // onLoad = {(e) => e.target = handleImageOverride(e)}
                    // overrideSrc={item.src}
                    // placeholder="blur"
                    // blurDataURL={rgbDataURL(237, 181, 6)}
                    // placeholder= {`data:image/webp; ${item.placeHolder}`}
                    // blurDataURL={item.placeHolder}

                ></Image>

                {/* Overlay with Action Buttons */}
                <div className="portfolio-btn">
                    <motion.a
                        className="btn btn-lg-square btn-outline-primary border-2 mx-1"
                        href={item.src}
                        data-lightbox="portfolio"
                        whileHover={{scale: 1.1}}
                        whileTap={{scale: 0.9}}
                        aria-label={`Read more about ${item.alt}`}
                    >
                        <FontAwesomeIcon icon={faEye} className="text-xl" ></FontAwesomeIcon>
                    </motion.a>
                    <motion.a
                        className="btn btn-lg-square btn-outline-primary border-2 mx-1"
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={{scale: 1.1}}
                        whileTap={{scale: 0.9}}
                        aria-label={`Visit ${item.alt}`}
                    >
                        <FontAwesomeIcon icon={faLink} className="text-xl" ></FontAwesomeIcon>
                    </motion.a>
                </div>
                
            </div>
        </motion.div>
    );
}

export default ProjectSection;