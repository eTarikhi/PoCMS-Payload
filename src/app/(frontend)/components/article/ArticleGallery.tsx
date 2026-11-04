'use client'

import * as Dialog from '@radix-ui/react-dialog'
import useEmblaCarousel from 'embla-carousel-react'
import Image from 'next/image'
import React, { useCallback, useEffect, useState } from 'react'

import type { ArticleGalleryLayout, ArticleGallerySlide } from '@/app/(frontend)/lib/types'

export type ArticleGalleryProps = {
  slides: ArticleGallerySlide[]
  layout?: ArticleGalleryLayout
}

const isOptimizableUrl = (src: string): boolean => {
  if (
    src.startsWith('/api/media/file/') ||
    src.startsWith('/api/media-frame') ||
    src.startsWith('/images/')
  ) {
    return true
  }
  try {
    const parsed = new URL(src)
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.endsWith('.public.blob.vercel-storage.com')
    )
  } catch {
    return false
  }
}

export function ArticleGallery({ slides, layout = 'carousel' }: ArticleGalleryProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: slides.length > 1 })
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const onSelect = useCallback(() => {
    if (!emblaApi) return
    setSelectedIndex(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    emblaApi.on('select', onSelect)
    emblaApi.on('reInit', onSelect)
    return () => {
      emblaApi.off('select', onSelect)
      emblaApi.off('reInit', onSelect)
    }
  }, [emblaApi, onSelect])

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi])
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi])
  const scrollTo = useCallback((idx: number) => emblaApi?.scrollTo(idx), [emblaApi])

  useEffect(() => {
    if (lightboxIndex === null || slides.length <= 1) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setLightboxIndex((prev) =>
          prev === null ? null : (prev - 1 + slides.length) % slides.length,
        )
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setLightboxIndex((prev) => (prev === null ? null : (prev + 1) % slides.length))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [lightboxIndex, slides.length])

  if (slides.length === 0) return null

  const activeLightboxSlide = lightboxIndex !== null ? slides[lightboxIndex] ?? null : null

  return (
    <section className="article-gallery" aria-label="Article image gallery">
      {layout === 'grid' ? (
        <div
          className={`article-gallery-grid${
            slides.length === 2 ? ' article-gallery-grid--two' : ''
          }`}
        >
          {slides.map((slide, idx) => {
            const hasBlur = Boolean(slide.blurDataURL?.startsWith('data:image/'))
            return (
              <figure key={slide.id} className="article-gallery-grid__item">
                <button
                  type="button"
                  className="article-gallery-grid__trigger"
                  onClick={() => setLightboxIndex(idx)}
                  aria-label={`Zoom image ${idx + 1}: ${slide.alt}`}
                >
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    width={slide.width || 960}
                    height={slide.height || 540}
                    sizes="(max-width: 768px) calc(100vw - 2.5rem), 400px"
                    unoptimized={!isOptimizableUrl(slide.src)}
                    placeholder={hasBlur ? 'blur' : 'empty'}
                    blurDataURL={hasBlur ? (slide.blurDataURL as string) : undefined}
                    style={
                      slide.objectPosition ? { objectPosition: slide.objectPosition } : undefined
                    }
                    className="article-gallery-grid__img"
                  />
                </button>
                {slide.caption ? (
                  <figcaption className="article-gallery__caption">{slide.caption}</figcaption>
                ) : null}
              </figure>
            )
          })}
        </div>
      ) : (
        <div className="article-gallery-carousel">
          <div className="article-gallery-carousel__stage">
            <div className="article-gallery-carousel__viewport" ref={emblaRef}>
              <div className="article-gallery-carousel__container">
                {slides.map((slide, idx) => {
                  const hasBlur = Boolean(slide.blurDataURL?.startsWith('data:image/'))
                  return (
                    <div key={slide.id} className="article-gallery-carousel__slide">
                      <button
                        type="button"
                        className="article-gallery-carousel__zoom-btn"
                        onClick={() => setLightboxIndex(idx)}
                        aria-label={`Open full-size image ${idx + 1}: ${slide.alt}`}
                      >
                        <Image
                          src={slide.src}
                          alt={slide.alt}
                          width={slide.width || 960}
                          height={slide.height || 540}
                          sizes="(max-width: 768px) calc(100vw - 2.5rem), (max-width: 1200px) 760px, 820px"
                          unoptimized={!isOptimizableUrl(slide.src)}
                          placeholder={hasBlur ? 'blur' : 'empty'}
                          blurDataURL={hasBlur ? (slide.blurDataURL as string) : undefined}
                          style={
                            slide.objectPosition
                              ? { objectPosition: slide.objectPosition }
                              : undefined
                          }
                          className="article-gallery-carousel__img"
                        />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {slides.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={scrollPrev}
                  className="article-gallery-carousel__nav article-gallery-carousel__nav--prev"
                  aria-label="Previous gallery image"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={scrollNext}
                  className="article-gallery-carousel__nav article-gallery-carousel__nav--next"
                  aria-label="Next gallery image"
                >
                  ›
                </button>
              </>
            ) : null}

            <div className="article-gallery-carousel__counter" aria-live="polite">
              {selectedIndex + 1} / {slides.length}
            </div>
          </div>

          {slides[selectedIndex]?.caption ? (
            <p className="article-gallery__caption">{slides[selectedIndex]?.caption}</p>
          ) : null}

          {slides.length > 1 ? (
            <div className="article-gallery-thumbs" role="tablist" aria-label="Gallery thumbnails">
              {slides.map((slide, idx) => {
                const active = idx === selectedIndex
                return (
                  <button
                    key={slide.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Show image ${idx + 1}: ${slide.alt}`}
                    onClick={() => scrollTo(idx)}
                    className={`article-gallery-thumbs__btn${active ? ' is-active' : ''}`}
                  >
                    <Image
                      src={slide.thumbSrc}
                      alt=""
                      width={120}
                      height={76}
                      sizes="120px"
                      unoptimized={!isOptimizableUrl(slide.thumbSrc)}
                      className="article-gallery-thumbs__img"
                    />
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      )}

      <Dialog.Root
        open={lightboxIndex !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxIndex(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="article-lightbox-overlay" />
          <Dialog.Content className="article-lightbox-content">
            <Dialog.Title className="visually-hidden">
              {activeLightboxSlide?.alt || 'Gallery image preview'}
            </Dialog.Title>
            <Dialog.Description className="visually-hidden">
              Full-resolution gallery image viewer. Use left and right arrow keys to switch images.
            </Dialog.Description>

            <div className="article-lightbox-topbar">
              <span className="article-lightbox-counter">
                {lightboxIndex !== null ? `${lightboxIndex + 1} / ${slides.length}` : ''}
              </span>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="article-lightbox-close"
                  aria-label="Close image viewer"
                >
                  ×
                </button>
              </Dialog.Close>
            </div>

            {activeLightboxSlide ? (
              <div className="article-lightbox-stage">
                {slides.length > 1 ? (
                  <button
                    type="button"
                    className="article-lightbox-arrow article-lightbox-arrow--prev"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev === null ? null : (prev - 1 + slides.length) % slides.length,
                      )
                    }
                    aria-label="Previous image"
                  >
                    ‹
                  </button>
                ) : null}

                <Image
                  src={activeLightboxSlide.src}
                  alt={activeLightboxSlide.alt}
                  width={activeLightboxSlide.width || 1600}
                  height={activeLightboxSlide.height || 900}
                  sizes="92vw"
                  unoptimized={!isOptimizableUrl(activeLightboxSlide.src)}
                  className="article-lightbox-img"
                />

                {slides.length > 1 ? (
                  <button
                    type="button"
                    className="article-lightbox-arrow article-lightbox-arrow--next"
                    onClick={() =>
                      setLightboxIndex((prev) =>
                        prev === null ? null : (prev + 1) % slides.length,
                      )
                    }
                    aria-label="Next image"
                  >
                    ›
                  </button>
                ) : null}
              </div>
            ) : null}

            {activeLightboxSlide?.caption ? (
              <p className="article-lightbox-caption">{activeLightboxSlide.caption}</p>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
