import {useEffect, useState} from "react";
import {motion} from "framer-motion";
// import Link from "next/link";
// import Script from "next/script";

const BackToTopButton = () => {

    const [showButton, setShowButton] = useState(false); // State to manage visibility of the button

    useEffect(() => {
        // Effect to handle scroll events
        const handleScroll = () => {
            // Show button if scrolled down more than 300 pixels
            setShowButton(window.scrollY > 300);
        };

        // Add scroll event listener
        window.addEventListener("scroll", handleScroll);
        // Cleanup function to remove the event listener when component unmounts
        return () => window.removeEventListener("scroll", handleScroll);
    }, []); // Empty dependency array means it runs only once when the component mounts

    const scrollToTop = () => {

        const scrollDuration = 1500; // Duration of the scroll animation in milliseconds
        const startScrollY = window.scrollY; // Get the current scroll position
        const startTime = performance.now(); // Record the start time for the animation

        const animateScroll = (currentTime) => {

            const elapsedTime = currentTime - startTime; // Calculate how much time has passed
            const progress = Math.min(elapsedTime / scrollDuration, 1); // Normalize progress (0 to 1)

            // Easing function for smooth scrolling
            const easeInOut = (t) => {
                return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // Easing calculation
            };
            
            const easeProgress = easeInOut(progress); // Apply easing function to progress

            // Calculate target scroll position based on the easing progress
            const targetScrollY = startScrollY * (1 - easeProgress);
            window.scrollTo(0, targetScrollY); // Scroll to the calculated position

            // Continue animation if progress is less than 1 (target not reached)
            if (progress < 1) {
                requestAnimationFrame(animateScroll); // Request the next frame for animation
            }
        };

        requestAnimationFrame(animateScroll); // Start the animation
    };

    return (
        <>
            {showButton && ( // Render button only if showButton is true
                <motion.button
                    className="btn btn-lg btn-primary btn-lg-square back-to-top wow fadeInUp"
                    onClick={scrollToTop} // Scroll to top on button click
                    initial={{scale: 0}} // Start the button animation at scale 0
                    animate={{scale: 1}} // Animate button to scale 1
                    exit={{scale: 0}} // Exit animation scale back to 0
                    transition={{duration: 0.7}} // Animation duration
                >
                    <i className="bi bi-arrow-up"></i> {/* Icon for the button */}
                </motion.button>
            )}
        </>
    );
};

const Libraries = () => {
    useEffect(() => {
        import("bootstrap/dist/js/bootstrap.bundle.js");
    }, []);
    return (
        <>
            <BackToTopButton></BackToTopButton>
            {/* <Link href="#" className="btn btn-lg btn-primary btn-lg-square back-to-top"><i className="bi bi-arrow-up"></i></Link> */}
            {/* <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0/dist/js/bootstrap.bundle.min.js"></Script> */}
            {/* <Script
                src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0/dist/js/bootstrap.bundle.min.js"
                integrity="sha384-ygbV9kiqUc6oa4msXn9868pTtWMgiQaeYH7/t7LECLbyPA2x65Kgf80OJFdroafW"
                crossOrigin="anonymous"
            ></Script> */}
        </>
    );
};

export default Libraries;
