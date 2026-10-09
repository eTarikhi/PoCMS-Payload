import HeadBlock from "../components/head";
import Header from "../components/header";
import Menu from "../components/navigation";
import AboutSection from "../components/sections/about";
import ServiceSection from "../components/sections/services";
import SkillSection from "../components/sections/skills";
import CertificateSection from "../components/sections/certificates";
import ProjectSection from "../components/sections/projects";
import ArticleSection from "../components/sections/articles";
import Footer from "../components/footer";
import Libraries from "../components/libraries";

export default function Home(props) {
    return (
        <>
            <HeadBlock />
            <Menu />
            <Header />
            <main data-bs-spy="scroll" data-bs-target=".navbar" data-bs-offset="51">
                <AboutSection />
                <ServiceSection />
                <SkillSection />
                <CertificateSection />
                <ProjectSection />
                <ArticleSection />
            </main>
            <Footer />
            <Libraries />
        </>
    );
}
