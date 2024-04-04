import {useMemo} from 'react';
import {getMDXComponent} from 'mdx-bundler/client';
import {Metadata} from 'next';
import {notFound} from 'next/navigation';

import {apiCategories} from 'sentry-docs/build/resolveOpenAPI';
import {ApiCategoryPage} from 'sentry-docs/components/apiCategoryPage';
import {ApiPage} from 'sentry-docs/components/apiPage';
import {DocPage} from 'sentry-docs/components/docPage';
import {Home} from 'sentry-docs/components/home';
import {Include} from 'sentry-docs/components/include';
import {PlatformContent} from 'sentry-docs/components/platformContent';
import {
  getCurrentPlatformOrGuide,
  getDocsRootNode,
  nodeForPath,
} from 'sentry-docs/docTree';
import {getDocsFrontMatter, getFileBySlug} from 'sentry-docs/mdx';
import {mdxComponents} from 'sentry-docs/mdxComponents';
import {setServerContext} from 'sentry-docs/serverContext';
import {capitilize} from 'sentry-docs/utils';

export async function generateStaticParams() {
  const docs = await getDocsFrontMatter();
  const paths: {path: string[] | undefined}[] = docs.map(doc => {
    const path = doc.slug.split('/');
    return {path};
  });
  paths.push({path: undefined}); // the home page
  return paths;
}

// Only render paths returned by generateStaticParams
export const dynamicParams = false;
export const dynamic = 'force-static';

const mdxComponentsWithWrapper = mdxComponents(
  {Include, PlatformContent},
  ({children, frontMatter}) => <DocPage frontMatter={frontMatter}>{children}</DocPage>
);

function MDXLayoutRenderer({mdxSource, ...rest}) {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource]);
  return <MDXLayout components={mdxComponentsWithWrapper} {...rest} />;
}

export default async function Page({params}) {
  if (!params.path) {
    return <Home />;
  }

  // get frontmatter of all docs in tree
  const docs = await getDocsFrontMatter();
  const rootNode = await getDocsRootNode();
  if (!rootNode) {
    console.warn('no root node');
    return notFound();
  }

  setServerContext({
    rootNode,
    path: params.path,
  });

  if (params.path[0] === 'api' && params.path.length > 1) {
    const categories = await apiCategories();
    const category = categories.find(c => c.slug === params.path[1]);
    if (category) {
      if (params.path.length === 2) {
        return <ApiCategoryPage category={category} />;
      }
      const api = category.apis.find(a => a.slug === params.path[2]);
      if (api) {
        return <ApiPage api={api} />;
      }
    }
  }

  const pageNode = nodeForPath(rootNode, params.path);
  if (!pageNode) {
    console.warn('no page node', params.path);
    return notFound();
  }

  const pagePath =
    // if the page comes from a superFallbackPlatform, use the superFallbackPlatform's slug
    pageNode.frontmatter.superFallbackSlug ?? pageNode.frontmatter.slug;
  // get the MDX for the current doc and render it
  let doc: Awaited<ReturnType<typeof getFileBySlug>> | null = null;
  try {
    doc = await getFileBySlug(`docs/${pagePath}`);
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('ENOENT', pageNode.path);
      return notFound();
    }
    throw e;
  }
  const {mdxSource, frontMatter} = doc;

  // pass frontmatter tree into sidebar, rendered page + fm into middle, headers into toc
  return (
    <MDXLayoutRenderer docs={docs} mdxSource={mdxSource} frontMatter={frontMatter} />
  );
}

type MetadataProps = {
  params: {
    path?: string[];
  };
};

export async function generateMetadata({params}: MetadataProps): Promise<Metadata> {
  const domain = 'https://docs.sentry.io';
  // enable og iamge preview on preview deployments
  const previewDomain = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : domain;
  let title =
    'Sentry Docs | Application Performance Monitoring &amp; Error Tracking Software';
  let description =
    'Self-hosted and cloud-based application performance monitoring &amp; error tracking that helps software teams see clearer, solve quicker, &amp; learn continuously.';
  const images = [{url: `${previewDomain ?? domain}/meta.jpg`, width: 1200, height: 822}];

  const rootNode = await getDocsRootNode();

  if (rootNode && params.path) {
    const pageNode = nodeForPath(rootNode, params.path);
    if (pageNode) {
      const guideOrPlatform = getCurrentPlatformOrGuide(rootNode, params.path);
      title =
        pageNode.frontmatter.title +
        (guideOrPlatform ? ` | Sentry for ${capitilize(guideOrPlatform.name)}` : '');
      description = pageNode.frontmatter.description ?? '';
    }
  }

  let canonical = domain;
  if (params.path) {
    canonical = `${domain}/${params.path.join('/')}/`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      images,
    },
    twitter: {
      title,
      description,
      images,
    },
    alternates: {
      canonical,
    },
  };
}
