import type { Interpolation, Theme } from "@emotion/react";
import Close from "@mui/icons-material/Close";
import WarningOutlined from "@mui/icons-material/WarningOutlined";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import { visuallyHidden } from "@mui/utils";
import { JobError } from "api/queries/templates";
import type { TemplateVersion } from "api/typesGenerated";
import { Loader } from "components/Loader/Loader";
import { useWatchVersionLogs } from "modules/templates/useWatchVersionLogs";
import { WorkspaceBuildLogs } from "modules/workspaces/WorkspaceBuildLogs/WorkspaceBuildLogs";
import { type FC, useLayoutEffect, useRef } from "react";
import { navHeight } from "theme/constants";
import { provisionersUnhealthy } from "modules/provisioners/useCompatibleProvisioners";
import { useQuery } from "react-query";
import { provisionerDaemons } from "api/queries/organizations";
import { ProvisionerAlert } from "modules/provisioners/ProvisionerAlert";

type BuildLogsDrawerProps = {
	error: unknown;
	open: boolean;
	onClose: () => void;
	templateVersion: TemplateVersion | undefined;
	variablesSectionRef: React.RefObject<HTMLDivElement>;
};

export const BuildLogsDrawer: FC<BuildLogsDrawerProps> = ({
	templateVersion,
	error,
	variablesSectionRef,
	...drawerProps
}) => {
	const org = templateVersion?.organization_id
	const {
		data: compatibleProvisioners,
		isLoading: provisionerDaemonsLoading,
		isError: couldntGetProvisioners,
	}  = useQuery(
		org ? provisionerDaemons(org, templateVersion?.job.tags) : { enabled: false}
	);
	const compatibleProvisionersUnhealthy = !compatibleProvisioners || provisionersUnhealthy(compatibleProvisioners);

	const logs = useWatchVersionLogs(templateVersion);
	const logsContainer = useRef<HTMLDivElement>(null);

	const scrollToBottom = () => {
		setTimeout(() => {
			if (logsContainer.current) {
				logsContainer.current.scrollTop = logsContainer.current.scrollHeight;
			}
		}, 0);
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: consider refactoring
	useLayoutEffect(() => {
		scrollToBottom();
	}, [logs]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: consider refactoring
	useLayoutEffect(() => {
		if (drawerProps.open) {
			scrollToBottom();
		}
	}, [drawerProps.open]);

	const isMissingVariables =
		error instanceof JobError &&
		error.job.error_code === "REQUIRED_TEMPLATE_VARIABLES";

	return (
		<Drawer anchor="right" {...drawerProps}>
			<div css={styles.root}>
				<header css={styles.header}>
					<h3 css={styles.title}>Creating template...</h3>
					<IconButton size="small" onClick={drawerProps.onClose}>
						<Close css={styles.closeIcon} />
						<span style={visuallyHidden}>Close build logs</span>
					</IconButton>
				</header>

				{  !logs && !provisionerDaemonsLoading && (
					couldntGetProvisioners ? (
						<ProvisionerAlert
							severity="warning"
							title="Something went wrong"
							detail="Could not determine provisioner status. Your template build may fail. If your template does not build, please contact your administrator"
						/>
					) : (!compatibleProvisioners || compatibleProvisioners.length === 0) ? (
						<ProvisionerAlert
							severity="warning"
							title="Template Creation Stuck"
							detail="This organization does not have any provisioners to process this template. Configure a provisioner."
						/>
					) : compatibleProvisionersUnhealthy && (
						<ProvisionerAlert
							severity="warning"
							title="Template Creation Delayed"
							detail="Provisioners are currently unresponsive. This may delay your template creation. Please contact your administrator for support."
						/>
					)
				)}

				{isMissingVariables ? (
					<MissingVariablesBanner
						onFillVariables={() => {
							variablesSectionRef.current?.scrollIntoView({
								behavior: "smooth",
							});
							const firstVariableInput =
								variablesSectionRef.current?.querySelector("input");
							setTimeout(() => firstVariableInput?.focus(), 0);
							drawerProps.onClose();
						}}
					/>
				) : logs ? (
					<section ref={logsContainer} css={styles.logs}>
						<WorkspaceBuildLogs logs={logs} css={{ border: 0 }} />
					</section>
				) : (
					<Loader />
				)}
			</div>
		</Drawer>
	);
};

type MissingVariablesBannerProps = { onFillVariables: () => void };

const MissingVariablesBanner: FC<MissingVariablesBannerProps> = ({
	onFillVariables,
}) => {
	return (
		<div css={bannerStyles.root}>
			<div css={bannerStyles.content}>
				<WarningOutlined css={bannerStyles.icon} />
				<h4 css={bannerStyles.title}>Missing variables</h4>
				<p css={bannerStyles.description}>
					During the build process, we identified some missing variables. Rest
					assured, we have automatically added them to the form for you.
				</p>
				<Button
					css={bannerStyles.button}
					size="small"
					variant="outlined"
					onClick={onFillVariables}
				>
					Fill variables
				</Button>
			</div>
		</div>
	);
};

const styles = {
	root: {
		width: 800,
		height: "100%",
		display: "flex",
		flexDirection: "column",
	},
	header: (theme) => ({
		height: navHeight,
		padding: "0 24px",
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottom: `1px solid ${theme.palette.divider}`,
	}),
	title: {
		margin: 0,
		fontWeight: 500,
		fontSize: 16,
	},
	closeIcon: {
		fontSize: 20,
	},
	logs: (theme) => ({
		flex: 1,
		overflow: "auto",
		backgroundColor: theme.palette.background.default,
	}),
} satisfies Record<string, Interpolation<Theme>>;

const bannerStyles = {
	root: {
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		padding: 40,
	},
	content: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		textAlign: "center",
		maxWidth: 360,
	},
	icon: (theme) => ({
		fontSize: 32,
		color: theme.roles.warning.fill.outline,
	}),
	title: {
		fontWeight: 500,
		lineHeight: "1",
		margin: 0,
		marginTop: 16,
	},
	description: (theme) => ({
		color: theme.palette.text.secondary,
		fontSize: 14,
		margin: 0,
		marginTop: 8,
		lineHeight: "1.5",
	}),
	button: {
		marginTop: 16,
	},
} satisfies Record<string, Interpolation<Theme>>;
