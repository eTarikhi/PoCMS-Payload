import React, {useState, useEffect} from "react"; // Importing React and necessary hooks
import Link from "next/link"; // Importing Link component from Next.js for navigation
import Image from "next/image"; // Importing Image component from Next.js for optimized images

interface HeaderInfoProps {
    id: number;
    sureName: string;
    imageUrl: string;
    requestCV: string;
    professionTexts: Array<String>;
};

const jsonDB = require("./database.json");
const headerInfo: HeaderInfoProps[] = jsonDB.map((data) => ( data.header ));

console.log("Imported JSON data:", jsonDB);
console.log(headerInfo);

// TypingEffect component definition, takes various props for configuration
const TypingEffect = ({
    texts,
    typeSpeed = 100, // Speed of typing effect
    deleteSpeed = 50, // Speed of deleting effect
    pauseTime = 2000, // Pause between typing and deleting
    infinite = true, // Whether the typing effect should be infinite
    color = "black", // Color of the displayed text
    cursorColor = "gray", // Color of the blinking cursor
}) => {
    const [displayText, setDisplayText] = useState(""); // State for the text currently being displayed
    const [currentTextIndex, setCurrentTextIndex] = useState(0); // Index of the current text being typed
    const [isDeleting, setIsDeleting] = useState(false); // State to determine if the text is currently being deleted
    const [iterationCount, setIterationCount] = useState(0); // Count of iterations for non-infinite typing

    // Effect to handle the typing and deleting effect
    useEffect(() => {
        const handleTyping = () => {
            const currentText = texts[currentTextIndex]; // Get the current text to type
            if (!isDeleting) {
                // Typing effect
                if (displayText.length < currentText.length) {
                    // If not fully typed, continue typing
                    setDisplayText(currentText.substring(0, displayText.length + 1)); // Add one more character
                } else {
                    // Finished typing current text
                    setTimeout(() => setIsDeleting(true), pauseTime); // Start deleting after pause
                }
            } else {
                // Deleting effect
                if (displayText.length > 0) {
                    // If there's text to delete
                    setDisplayText(currentText.substring(0, displayText.length - 1)); // Remove one character
                } else {
                    // Finished deleting current text
                    setIsDeleting(false); // Reset deleting state
                    const nextIndex = (currentTextIndex + 1) % texts.length; // Get the next text index
                    setCurrentTextIndex(nextIndex); // Update current text index
                    if (!infinite) {
                        setIterationCount((prev) => prev + 1); // Increase iteration count if not infinite
                    }
                }
            }
        };

        // Stop if not in infinite mode and all iterations completed
        if (!infinite && iterationCount >= texts.length) {
            return;
        }

        const speed = isDeleting ? deleteSpeed : typeSpeed; // Determine speed based on typing or deleting state
        const timer = setTimeout(handleTyping, speed); // Set a timeout for the typing or deleting effect
        return () => clearTimeout(timer); // Cleanup timer on component unmount or update
    }, [displayText, currentTextIndex, isDeleting, texts, typeSpeed, deleteSpeed, pauseTime, infinite, iterationCount]);

    return (
        <span
            className="typing-effect" // CSS class for styling
            style={{
                color: color, // Set text color
                position: "relative", // Relative positioning for cursor effect
            }}
        >
            {displayText} {/* Display the current text being typed */}
            <span
                className="cursor" // CSS class for cursor
                style={{
                    color: cursorColor, // Set cursor color
                    animation: "blink 0.7s infinite", // Blink animation for cursor
                }}
            >
                | {/* Display the cursor character */}
            </span>
        </span>
    );
};

// Header component definition
const Header = () => {
    return (
        <header>
            <div className="container-fluid my-6 mt-0" id="home">
                <div className="container">
                    {headerInfo.map((header) => (
                        <div key={header.id} className="row g-5 align-items-center">
                            <div className="col-lg-6 py-lg-6 pb-0 pt-lg-0">
                                <div className="" style={{minHeight: 200}}>
                                    {/* Left column with text */}
                                    <h3 className="typed-balancer text-secondary mb-3">I'm</h3>
                                    <h1 className="display-3 mb-3 text-white">{header.sureName}</h1>
                                    <h2 className="typed-text-output d-inline">
                                        <TypingEffect // Using the TypingEffect component
                                            texts={header.professionTexts}
                                            typeSpeed={100}
                                            deleteSpeed={20}
                                            pauseTime={200}
                                            infinite={true}
                                            color="light"
                                            cursorColor="light"
                                        />
                                    </h2>
                                </div>
                                <div className="d-flex align-items-center pt-lg-4">
                                    <Link
                                        href={header.requestCV} // WhatsApp link for requesting CV
                                        className="btn btn-primary py-3 px-4 me-5"
                                    >
                                        Request CV
                                    </Link>
                                </div>
                            </div>
                            <div className="col-lg-6 order-first order-lg-last pt-lg-5">
                                {/* Right column with image */}
                                <Image
                                    className="img-fluid"
                                    src={header.imageUrl} // Profile image source
                                    alt="Profile" // Alt text for image
                                    width={700} // Image width
                                    height={700} // Image height
                                    priority={true}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </header>
    );
};

export default Header; // Exporting the Header component
