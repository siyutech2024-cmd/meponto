"use client";

import { useEffect, useRef } from "react";
import { translatePhrase } from "../lib/i18n";
import { useVentoStore } from "../lib/store";

const blockedTextParents = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"]);
const translatableAttributes = ["placeholder", "title", "aria-label"];

function htmlLang(language: string) {
  if (language === "zh") {
    return "zh-CN";
  }

  if (language === "pt") {
    return "pt-BR";
  }

  return "en";
}

export function I18nRuntime() {
  const language = useVentoStore((state) => state.language);
  const originalText = useRef(new WeakMap<Text, string>());
  const originalAttributes = useRef(new WeakMap<Element, Record<string, string>>());

  useEffect(() => {
    const translateTextNode = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || blockedTextParents.has(parent.tagName) || parent.closest("[data-i18n-skip]")) {
        return;
      }

      // Never touch dynamic numeric/symbol-only nodes (counters, money, dates):
      // caching them would freeze the value at first render.
      const raw = node.nodeValue ?? "";
      if (!/[A-Za-zÀ-ú一-鿿]/.test(raw)) {
        return;
      }

      const original = originalText.current.get(node) ?? node.nodeValue ?? "";
      if (!originalText.current.has(node)) {
        originalText.current.set(node, original);
      }

      const translated = translatePhrase(language, original);
      if (node.nodeValue !== translated) {
        node.nodeValue = translated;
      }
    };

    const translateElementAttributes = (element: Element) => {
      if (element.closest("[data-i18n-skip]")) {
        return;
      }

      const originals = originalAttributes.current.get(element) ?? {};
      let touched = false;

      for (const attr of translatableAttributes) {
        const current = element.getAttribute(attr);
        if (!current) {
          continue;
        }

        if (!originals[attr]) {
          originals[attr] = current;
          touched = true;
        }

        const translated = translatePhrase(language, originals[attr]);
        if (current !== translated) {
          element.setAttribute(attr, translated);
        }
      }

      if (touched) {
        originalAttributes.current.set(element, originals);
      }
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateTextNode(root as Text);
        return;
      }

      if (root.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = root as Element;
      translateElementAttributes(element);

      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let current = walker.nextNode();

      while (current) {
        if (current.nodeType === Node.TEXT_NODE) {
          translateTextNode(current as Text);
        } else if (current.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(current as Element);
        }

        current = walker.nextNode();
      }
    };

    document.documentElement.lang = htmlLang(language);
    translateTree(document.body);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          translateTextNode(mutation.target as Text);
        }

        if (mutation.type === "attributes") {
          translateElementAttributes(mutation.target as Element);
        }

        for (const node of mutation.addedNodes) {
          translateTree(node);
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: translatableAttributes,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [language]);

  return null;
}
