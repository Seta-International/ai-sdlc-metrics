# EventBridge: staging scale-to-zero rules (9am-8pm SGT weekdays)
# Scale up:   cron(0 1 ? * MON-FRI *)  → ECS desired count 1
# Scale down: cron(0 12 ? * MON-FRI *) → ECS desired count 0
# Production: no schedule rules
# TODO: aws_cloudwatch_event_rule, aws_cloudwatch_event_target x2
