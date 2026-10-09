import React from "react";
import Image from "next/image";
import Link from "next/link";

interface ArticlesProps {
    id: string;
    title: string;
    excerpt: string;
    author: string;
    readTime: string;
    imageUrl: string;
    link: string;
    map; // Not sure what this is for, could you provide more context?
    filter; // Add the filter property to the interface
}

// Import JSON data from local database file
const jsonDB = require("./../database.json");

// Map JSON data to defined interfaces
const jsonArticles: ArticlesProps[] = jsonDB.map((data) => data.articles);
const articles = jsonArticles[0];

console.log("Articles:", articles);

function ArticleCard({id, title, excerpt, author, readTime, imageUrl, link}: ArticlesProps) {
    return (
        <article key={id} className="col-lg-4 col-md-6">
            <div className="service-item rounded h-100 p-1 my-2 wow fadeInUp">
                <Link href={link} target="_blank" rel="noopener noreferrer" className="">
                    <div className="rounded overflow-hidden">
                        <Image
                            src={imageUrl || "/placeholder.svg"}
                            alt={title}
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            width={400}
                            height={255}
                            loading="lazy"
                            className="img-fluid"
                            onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
                                e.currentTarget.src = "/placeholder.svg";
                            }}
                        />
                    </div>
                    <div className="p-2">
                        <h3 className="h5 my-2 article-title">{title}</h3>
                        <p className="article-text">{excerpt}</p>
                    </div>
                </Link>
                <div className="px-4 pb-4 mt-auto">
                    <p className="text-xs text-muted-foreground">
                        Issued: {author} • {readTime} read
                    </p>
                </div>
            </div>
        </article>
    );
}

const ArticleSection = () => {
    return (
        <section id="article">
            <div className="container-xxl py-5">
                <div className="row g-5">
                    <div className="col-12 wow fadeInUp" data-wow-delay="0.1s">
                        {/* Section Title */}
                        <div className="row g-5 mb-5 wow fadeInUp" data-wow-delay="0.1s">
                            <div className="col-lg-6">
                                <h2 className="display-6 mb-0">Latest Articles</h2>
                            </div>
                            <div className="col-lg-6 text-lg-end">
                                <Link
                                    className="btn btn-primary py-3 px-5"
                                    target="_blank"
                                    href="https://www.linkedin.com/in/etarikhi/recent-activity/articles/"
                                >
                                    All Articles &gt;
                                </Link>
                            </div>
                        </div>
                        <div className="row gy-1 gx-4 align-items-center">
                            {articles.map((article) => ArticleCard(article))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default ArticleSection;
